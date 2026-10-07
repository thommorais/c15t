package api_test

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"thom/api"
	"thom/core/apikey"
	"thom/core/docsnapshot"
	"thom/core/policy"
	"thom/core/ratelimit"
	_ "thom/migrations"
)

type harness struct {
	t   *testing.T
	app *tests.TestApp
	mux http.Handler
}

func newHarness(t *testing.T, cfg api.Config) *harness {
	t.Helper()

	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	if err := app.RunAppMigrations(); err != nil {
		t.Fatalf("RunAppMigrations: %v", err)
	}

	pbRouter, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("NewRouter: %v", err)
	}

	api.Register(app, &core.ServeEvent{App: app, Router: pbRouter}, cfg)

	mux, err := pbRouter.BuildMux()
	if err != nil {
		t.Fatalf("BuildMux: %v", err)
	}

	return &harness{t: t, app: app, mux: mux}
}

func (h *harness) key() string {
	return h.scopedKey(apikey.ScopeSecret)
}

func (h *harness) publishableKey() string {
	return h.scopedKey(apikey.ScopePublishable)
}

func (h *harness) keyWithOrigins(scope apikey.Scope, origins string) string {
	h.t.Helper()

	id := h.scopedKey(scope)

	record, err := h.app.FindFirstRecordByFilter(
		"apiKey", "keyHash = {:hash}", dbx.Params{"hash": apikey.Hash(id)})
	if err != nil {
		h.t.Fatalf("find key: %v", err)
	}
	record.Set("origins", origins)
	if err := h.app.Save(record); err != nil {
		h.t.Fatalf("set origins: %v", err)
	}

	return id
}

func (h *harness) scopedKey(scope apikey.Scope) string {
	h.t.Helper()

	key, err := apikey.Generate(apikey.EnvTest, scope)
	if err != nil {
		h.t.Fatalf("Generate: %v", err)
	}

	collection, err := h.app.FindCollectionByNameOrId("apiKey")
	if err != nil {
		h.t.Fatalf("find apiKey: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("keyHash", key.Hash)
	record.Set("env", string(apikey.EnvTest))
	record.Set("scope", string(scope))
	record.Set("revoked", false)

	if err := h.app.Save(record); err != nil {
		h.t.Fatalf("save apiKey: %v", err)
	}

	return key.Secret
}

func (h *harness) do(method, url, body string, headers map[string]string) *httptest.ResponseRecorder {
	h.t.Helper()

	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}

	req := httptest.NewRequest(method, url, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	rec := httptest.NewRecorder()
	h.mux.ServeHTTP(rec, req)

	return rec
}

func (h *harness) count(table string) int {
	h.t.Helper()

	var n int
	err := h.app.DB().NewQuery("SELECT count(*) FROM " + table).Row(&n)
	if err != nil {
		h.t.Fatalf("count %s: %v", table, err)
	}

	return n
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}

	return out
}

func auth(key string, extra ...string) map[string]string {
	h := map[string]string{"Authorization": "Bearer " + key}
	for i := 0; i+1 < len(extra); i += 2 {
		h[extra[i]] = extra[i+1]
	}
	return h
}

func TestInitRequiresAuth(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	tests := []struct {
		name    string
		headers map[string]string
	}{
		{name: "no header", headers: nil},
		{name: "bogus key", headers: auth("c15t_test_nope")},
		{name: "wrong scheme", headers: map[string]string{"Authorization": "Basic abc"}},
		{name: "unprefixed token", headers: map[string]string{"Authorization": "Bearer abc"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := h.do(http.MethodGet, "/api/c15t/init", "", tt.headers)
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", rec.Code)
			}
		})
	}
}

func TestInitRejectsRevokedKey(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	record, err := h.app.FindFirstRecordByFilter(
		"apiKey",
		"keyHash = {:hash}",
		dbx.Params{"hash": apikey.Hash(key)},
	)
	if err != nil {
		t.Fatalf("find key: %v", err)
	}
	record.Set("revoked", true)
	if err := h.app.Save(record); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 for a revoked key", rec.Code)
	}
}

func TestInitResolvesPolicy(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	tests := []struct {
		name             string
		headers          map[string]string
		wantJurisdiction string
		wantPolicy       string
		wantModel        string
		wantMatchedBy    string
	}{
		{
			name:             "germany",
			headers:          auth(key, "cf-ipcountry", "DE"),
			wantJurisdiction: "GDPR",
			wantPolicy:       "europe_opt_in",
			wantModel:        "opt-in",
			wantMatchedBy:    "country",
		},
		{
			name:             "uk",
			headers:          auth(key, "cf-ipcountry", "GB"),
			wantJurisdiction: "UK_GDPR",
			wantPolicy:       "europe_opt_in",
			wantModel:        "opt-in",
			wantMatchedBy:    "country",
		},
		{
			name:             "california",
			headers:          auth(key, "x-vercel-ip-country", "US", "x-vercel-ip-country-region", "CA"),
			wantJurisdiction: "CCPA",
			wantPolicy:       "california_opt_out",
			wantModel:        "opt-out",
			wantMatchedBy:    "region",
		},
		{
			name:             "quebec",
			headers:          auth(key, "cf-ipcountry", "CA", "x-c15t-region", "QC"),
			wantJurisdiction: "QC_LAW25",
			wantPolicy:       "quebec_opt_in",
			wantModel:        "opt-in",
			wantMatchedBy:    "region",
		},
		{
			name:             "other us state falls to default",
			headers:          auth(key, "x-vercel-ip-country", "US", "x-vercel-ip-country-region", "NY"),
			wantJurisdiction: "NONE",
			wantPolicy:       "world_no_banner",
			wantModel:        "none",
			wantMatchedBy:    "default",
		},
		{
			name:             "unknown geo falls back to europe",
			headers:          auth(key),
			wantJurisdiction: "NONE",
			wantPolicy:       "europe_opt_in",
			wantModel:        "opt-in",
			wantMatchedBy:    "fallback",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := h.do(http.MethodGet, "/api/c15t/init", "", tt.headers)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
			}

			body := decode(t, rec)
			if got := body["jurisdiction"]; got != tt.wantJurisdiction {
				t.Errorf("jurisdiction = %v, want %v", got, tt.wantJurisdiction)
			}

			policy, ok := body["policy"].(map[string]any)
			if !ok {
				t.Fatalf("policy missing from %s", rec.Body.String())
			}
			if got := policy["id"]; got != tt.wantPolicy {
				t.Errorf("policy id = %v, want %v", got, tt.wantPolicy)
			}
			if got := policy["model"]; got != tt.wantModel {
				t.Errorf("model = %v, want %v", got, tt.wantModel)
			}

			decision, ok := body["policyDecision"].(map[string]any)
			if !ok {
				t.Fatalf("policyDecision missing from %s", rec.Body.String())
			}
			if got := decision["matchedBy"]; got != tt.wantMatchedBy {
				t.Errorf("matchedBy = %v, want %v", got, tt.wantMatchedBy)
			}
			if fp, _ := decision["fingerprint"].(string); len(fp) != 64 {
				t.Errorf("fingerprint = %q, want 64 hex chars", fp)
			}
		})
	}
}

func TestInitGeoDisabledFallsBackToGDPR(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.GeoDisabled = true

	h := newHarness(t, cfg)
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "US"))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if got := body["jurisdiction"]; got != "GDPR" {
		t.Errorf("jurisdiction = %v, want GDPR when geo is disabled", got)
	}

	location, ok := body["location"].(map[string]any)
	if !ok {
		t.Fatalf("location missing")
	}
	if len(location) != 0 {
		t.Errorf("location = %v, want empty when geo is disabled", location)
	}
}

func TestInitCarriesTheNoticeTranslations(t *testing.T) {
	german := "de"

	tests := []struct {
		name   string
		packs  []policy.Config
		header string
		want   string
	}{
		{name: "no header is english", header: "", want: "en"},
		{name: "primary subtag", header: "de-DE,en;q=0.9", want: "de"},
		{name: "brazilian portuguese", header: "pt-BR,pt;q=0.9", want: "pt-BR"},
		{name: "european portuguese", header: "pt-PT", want: "pt-PT"},
		{name: "unsupported language", header: "xx-XX", want: "en"},
		{
			name:   "policy language wins over the header",
			header: "fr",
			want:   "de",
			packs: []policy.Config{{
				ID:    "german",
				Match: policy.MatchCountries([]string{"DE"}),
				I18n:  &policy.I18n{Language: &german},
			}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := api.DefaultConfig()
			if tt.packs != nil {
				cfg.PolicyPacks = tt.packs
			}

			h := newHarness(t, cfg)
			headers := []string{"cf-ipcountry", "DE"}
			if tt.header != "" {
				headers = append(headers, "Accept-Language", tt.header)
			}

			rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(h.key(), headers...))
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			shown, ok := decode(t, rec)["translations"].(map[string]any)
			if !ok {
				t.Fatalf("translations missing: %s", rec.Body.String())
			}
			if shown["language"] != tt.want {
				t.Errorf("language = %v, want %s", shown["language"], tt.want)
			}

			strings, _ := shown["translations"].(map[string]any)
			if common, _ := strings["common"].(map[string]any); common["acceptAll"] == nil {
				t.Errorf("translations = %v, want the notice strings", strings)
			}
			if _, present := strings["iab"]; present {
				t.Error("the iab section must not be sent")
			}
		})
	}
}

func languagePack(proof *policy.ProofConfig) []policy.Config {
	model := policy.ModelOptIn
	return []policy.Config{
		{
			ID:      "open_de",
			Match:   policy.MatchCountries([]string{"DE"}),
			Consent: &policy.ConsentConfig{Model: &model},
			Proof:   proof,
		},
		policy.PresetWorldNoBanner(),
	}
}

func snapshotPayloadOf(t *testing.T, token string) map[string]any {
	t.Helper()

	raw, err := base64.RawURLEncoding.DecodeString(strings.Split(token, ".")[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	return payload
}

func TestSnapshotCarriesTheLanguageShown(t *testing.T) {
	h := newHarness(t, snapshotConfig(false))

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(h.key(), "cf-ipcountry", "DE", "Accept-Language", "pt-BR,pt;q=0.9"))
	token, _ := decode(t, rec)["policySnapshotToken"].(string)
	if token == "" {
		t.Fatal("no snapshot token issued")
	}

	if got := snapshotPayloadOf(t, token)["language"]; got != "pt-BR" {
		t.Errorf("language = %v, want the pt-BR the visitor was shown", got)
	}
}

func TestConsentRecordsTheLanguageShown(t *testing.T) {
	yes, no := true, false

	tests := []struct {
		name         string
		proof        *policy.ProofConfig
		initHeader   string
		writeHeader  string
		useToken     bool
		wantMetadata string
		wantDecision string
	}{
		{name: "storeLanguage on, language from the token", proof: &policy.ProofConfig{StoreLanguage: &yes}, initHeader: "pt-BR", writeHeader: "en", useToken: true, wantMetadata: "pt-BR", wantDecision: "pt-BR"},
		{name: "storeLanguage on, language from the request", proof: &policy.ProofConfig{StoreLanguage: &yes}, writeHeader: "de-DE", wantMetadata: "de", wantDecision: "de"},
		{name: "storeLanguage off keeps it out of the consent", proof: &policy.ProofConfig{StoreLanguage: &no}, writeHeader: "de-DE", wantMetadata: "", wantDecision: "de"},
		{name: "storeLanguage unset defaults to off", proof: nil, writeHeader: "de-DE", wantMetadata: "", wantDecision: "de"},
		{name: "unsupported language is recorded as english", proof: &policy.ProofConfig{StoreLanguage: &yes}, writeHeader: "xx-XX", wantMetadata: "en", wantDecision: "en"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := snapshotConfig(false)
			cfg.PolicyPacks = languagePack(tt.proof)

			h := newHarness(t, cfg)
			key := h.key()

			extra := ""
			if tt.useToken {
				init := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE", "Accept-Language", tt.initHeader))
				token, _ := decode(t, init)["policySnapshotToken"].(string)
				extra = `,"policySnapshotToken":"` + token + `"`
			}

			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"metadata":{"policyLanguage":"forged"}`+extra+`}`,
				auth(key, "cf-ipcountry", "DE", "Accept-Language", tt.writeHeader))
			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
			if err != nil {
				t.Fatalf("find consent: %v", err)
			}
			var metadata map[string]any
			if err := stored.UnmarshalJSONField("metadata", &metadata); err != nil {
				t.Fatalf("metadata: %v", err)
			}

			got, _ := metadata["policyLanguage"].(string)
			if got != tt.wantMetadata {
				t.Errorf("metadata.policyLanguage = %q, want %q (a client-sent value never counts)", got, tt.wantMetadata)
			}

			decision, err := h.app.FindFirstRecordByFilter("runtimePolicyDecision", "id != ''", nil)
			if err != nil {
				t.Fatalf("find decision: %v", err)
			}
			if got := decision.GetString("language"); got != tt.wantDecision {
				t.Errorf("decision language = %q, want %q", got, tt.wantDecision)
			}
		})
	}
}

func TestDecisionsInDifferentLanguagesAreSeparateRows(t *testing.T) {
	cfg := snapshotConfig(false)
	cfg.PolicyPacks = languagePack(nil)

	h := newHarness(t, cfg)
	key := h.key()

	for i, language := range []string{"de", "pt-BR"} {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"2026-03-0`+strconv.Itoa(i+1)+`T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
			auth(key, "cf-ipcountry", "DE", "Accept-Language", language))
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
	}

	if got := h.count("runtimePolicyDecision"); got != 2 {
		t.Errorf("decision rows = %d, want 2: the notice language is part of what was shown", got)
	}
}

func TestInitStillCarriesTranslationsWithoutAPolicy(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.PolicyPacks = []policy.Config{}

	h := newHarness(t, cfg)
	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(h.key(), "cf-ipcountry", "DE", "Accept-Language", "pt-BR"))

	shown, _ := decode(t, rec)["translations"].(map[string]any)
	if shown["language"] != "pt-BR" {
		t.Errorf("translations = %v, want pt-BR even in no-banner mode", shown)
	}
}

func TestInitWithoutAMatchingPolicyIsNoBannerMode(t *testing.T) {
	californiaOnly := []policy.Config{{
		ID:      "california",
		Match:   policy.MatchRegions([]policy.Region{{Country: "US", Region: "CA"}}),
		Consent: &policy.ConsentConfig{Model: ptrTo(policy.ModelOptOut)},
		UI:      &policy.UIConfig{Mode: ptrTo(policy.UIModeBanner)},
	}}

	tests := []struct {
		name  string
		packs []policy.Config
	}{
		{name: "explicit empty pack", packs: []policy.Config{}},
		{name: "pack with no match for the request", packs: californiaOnly},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := snapshotConfig(true)
			cfg.PolicyPacks = tt.packs

			h := newHarness(t, cfg)
			rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(h.key(), "cf-ipcountry", "DE"))
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			body := decode(t, rec)
			shown, ok := body["policy"].(map[string]any)
			if !ok {
				t.Fatalf("policy missing, a client cannot tell no banner from a failure: %s", rec.Body.String())
			}
			if shown["id"] != "no_banner" || shown["model"] != "none" {
				t.Errorf("policy = %v, want id no_banner and model none", shown)
			}
			if ui, _ := shown["ui"].(map[string]any); ui["mode"] != "none" {
				t.Errorf("ui = %v, want mode none", shown["ui"])
			}
			if _, present := body["policyDecision"]; present {
				t.Error("a no-banner response must carry no policy decision")
			}
			if _, present := body["policySnapshotToken"]; present {
				t.Error("a no-banner response must carry no snapshot token")
			}
		})
	}
}

func TestConsentWrite(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary","measurement"],"uiSource":"banner","action":"accept_all"}`,
		auth(key, "cf-ipcountry", "DE", "X-Forwarded-For", "203.0.113.55", "User-Agent", "harness/1.0"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body["id"] == "" || body["id"] == nil {
		t.Error("response has no consent id")
	}
	if got := body["policyId"]; got != "europe_opt_in" {
		t.Errorf("policyId = %v, want europe_opt_in", got)
	}
	if body["validUntil"] == nil {
		t.Error("validUntil missing for a policy with expiryDays")
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}

	if got := stored.GetString("ipAddress"); got != "203.0.113.0" {
		t.Errorf("ipAddress = %q, want masked to 203.0.113.0", got)
	}
	if got := stored.GetString("jurisdiction"); got != "GDPR" {
		t.Errorf("jurisdiction = %q, want GDPR", got)
	}
	if got := stored.GetString("jurisdictionModel"); got != "opt-in" {
		t.Errorf("jurisdictionModel = %q, want opt-in", got)
	}
	if got := stored.GetString("userAgent"); got != "harness/1.0" {
		t.Errorf("userAgent = %q", got)
	}

	if h.count("auditLog") != 1 {
		t.Errorf("auditLog rows = %d, want 1", h.count("auditLog"))
	}
	if h.count("consentPurpose") != 2 {
		t.Errorf("consentPurpose rows = %d, want 2", h.count("consentPurpose"))
	}
}

func TestConsentValidation(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	tests := []struct {
		name string
		body string
		want int
	}{
		{
			name: "missing domain",
			body: `{"externalId":"x","categories":["necessary"]}`,
			want: http.StatusBadRequest,
		},
		{
			name: "missing subject and external id",
			body: `{"domain":"example.com","categories":["necessary"]}`,
			want: http.StatusBadRequest,
		},
		{
			name: "unknown ui source",
			body: `{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"uiSource":"telepathy"}`,
			want: http.StatusBadRequest,
		},
		{
			name: "unknown action",
			body: `{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"action":"shrug"}`,
			want: http.StatusBadRequest,
		},
		{
			name: "unknown subject id",
			body: `{"subjectId":"doesnotexist00","domain":"example.com","categories":["necessary"]}`,
			want: http.StatusBadRequest,
		},
		{
			name: "malformed json",
			body: `{"externalId":`,
			want: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := h.do(http.MethodPost, "/api/c15t/consent", tt.body, auth(key, "cf-ipcountry", "DE"))
			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body.String())
			}
		})
	}
}

func TestConsentRejectionLeavesNoRows(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	before := map[string]int{
		"consent":  h.count("consent"),
		"subject":  h.count("subject"),
		"domain":   h.count("domain"),
		"auditLog": h.count("auditLog"),
	}

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"rollback","domain":"rollback.com","categories":["necessary"],"action":"bogus"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}

	for table, want := range before {
		if got := h.count(table); got != want {
			t.Errorf("%s rows = %d, want %d unchanged after a rejected write", table, got, want)
		}
	}
}

func TestConsentStrictScopeAlwaysAllowsNecessary(t *testing.T) {
	strict := policy.ScopeStrict
	model := policy.ModelOptIn

	cfg := api.DefaultConfig()
	cfg.PolicyPacks = []policy.Config{
		{
			ID:    "measurement_only",
			Match: policy.MatchCountries([]string{"DE"}),
			Consent: &policy.ConsentConfig{
				Model:      &model,
				ScopeMode:  &strict,
				Categories: []string{"measurement"},
			},
		},
		policy.PresetWorldNoBanner(),
	}

	h := newHarness(t, cfg)
	key := h.key()

	post := func(categories string) *httptest.ResponseRecorder {
		return h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":`+categories+`}`,
			auth(key, "cf-ipcountry", "DE"))
	}

	if rec := post(`["necessary","measurement"]`); rec.Code != http.StatusCreated {
		t.Errorf("necessary with an allowed category: status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	wantEnvelope(t, post(`["necessary","marketing"]`), http.StatusBadRequest, "PURPOSE_NOT_ALLOWED")
}

func TestConsentStrictScopeRejectsOutOfScope(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.PolicyPacks = strictPack()

	h := newHarness(t, cfg)
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary","marketing"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an out-of-scope category: %s", rec.Code, rec.Body.String())
	}

	rec = h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 for an in-scope category: %s", rec.Code, rec.Body.String())
	}
}

func TestConsentDecisionDedupe(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	for _, ext := range []string{"a", "b", "c"} {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"2026-03-01T12:00:00Z","externalId":"`+ext+`","domain":"example.com","categories":["necessary"]}`,
			auth(key, "cf-ipcountry", "DE"),
		)
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
	}

	if got := h.count("consent"); got != 3 {
		t.Errorf("consent rows = %d, want 3", got)
	}
	if got := h.count("runtimePolicyDecision"); got != 1 {
		t.Errorf("runtimePolicyDecision rows = %d, want 1 shared decision", got)
	}

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"d","domain":"example.com","categories":["necessary"]}`,
		auth(key, "x-vercel-ip-country", "US", "x-vercel-ip-country-region", "CA"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	if got := h.count("runtimePolicyDecision"); got != 2 {
		t.Errorf("runtimePolicyDecision rows = %d, want 2 after a different geo", got)
	}
}

func TestConsentGPC(t *testing.T) {
	tests := []struct {
		name       string
		headers    map[string]string
		action     string
		wantAction string
	}{
		{
			name:       "gpc downgrades an auto-granted consent under california",
			headers:    map[string]string{"x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "Sec-GPC": "1"},
			action:     "accept_all",
			wantAction: "opt_out",
		},
		{
			name:       "gpc is ignored under gdpr",
			headers:    map[string]string{"cf-ipcountry": "DE", "Sec-GPC": "1"},
			action:     "accept_all",
			wantAction: "accept_all",
		},
		{
			name:       "gpc does not override an explicit choice",
			headers:    map[string]string{"x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "Sec-GPC": "1"},
			action:     "custom",
			wantAction: "custom",
		},
		{
			name:       "no gpc signal leaves the action alone",
			headers:    map[string]string{"x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA"},
			action:     "accept_all",
			wantAction: "accept_all",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			key := h.key()

			headers := auth(key)
			for k, v := range tt.headers {
				headers[k] = v
			}

			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary","marketing","measurement"],"action":"`+tt.action+`"}`,
				headers,
			)
			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			if got := decode(t, rec)["action"]; got != tt.wantAction {
				t.Errorf("action = %v, want %v", got, tt.wantAction)
			}
		})
	}
}

func TestConsentGPCDropsCategories(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary","marketing","measurement"],"action":"accept_all"}`,
		auth(key, "x-vercel-ip-country", "US", "x-vercel-ip-country-region", "CA", "Sec-GPC", "1"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	if got := h.count("consentPurpose"); got != 1 {
		t.Errorf("consentPurpose rows = %d, want only necessary to survive GPC", got)
	}
}

func TestConsentIPOptions(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*api.Config)
		wantIP  string
		comment string
	}{
		{
			name:   "masked by default",
			mutate: func(*api.Config) {},
			wantIP: "203.0.113.0",
		},
		{
			name:   "masking disabled stores the full address",
			mutate: func(c *api.Config) { c.MaskIPDisabled = true },
			wantIP: "203.0.113.55",
		},
		{
			name:   "tracking disabled stores nothing",
			mutate: func(c *api.Config) { c.TrackIPDisabled = true },
			wantIP: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := api.DefaultConfig()
			tt.mutate(&cfg)

			h := newHarness(t, cfg)
			key := h.key()

			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
				auth(key, "cf-ipcountry", "DE", "X-Forwarded-For", "203.0.113.55"),
			)
			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
			if err != nil {
				t.Fatalf("find consent: %v", err)
			}
			if got := stored.GetString("ipAddress"); got != tt.wantIP {
				t.Errorf("ipAddress = %q, want %q", got, tt.wantIP)
			}
		})
	}
}

func proofPack(proof *policy.ProofConfig) []policy.Config {
	model := policy.ModelOptIn
	language := "de"
	scrollLock := true
	mode := policy.UIModeBanner

	return []policy.Config{
		{
			ID:    "shown_de",
			Match: policy.MatchCountries([]string{"DE"}),
			I18n:  &policy.I18n{Language: &language},
			Consent: &policy.ConsentConfig{
				Model:                 &model,
				PreselectedCategories: []string{"necessary"},
			},
			UI: &policy.UIConfig{
				Mode:   &mode,
				Banner: &policy.UISurfaceConfig{ScrollLock: &scrollLock},
			},
			Proof: proof,
		},
		policy.PresetWorldNoBanner(),
	}
}

func TestConsentHonoursThePolicyProofConfig(t *testing.T) {
	no, yes := false, true

	tests := []struct {
		name      string
		proof     *policy.ProofConfig
		wantIP    string
		wantAgent string
	}{
		{name: "stores both by default", proof: nil, wantIP: "203.0.113.0", wantAgent: "probe/1"},
		{name: "storeIp false drops the address", proof: &policy.ProofConfig{StoreIP: &no}, wantIP: "", wantAgent: "probe/1"},
		{name: "storeUserAgent false drops the agent", proof: &policy.ProofConfig{StoreUserAgent: &no}, wantIP: "203.0.113.0", wantAgent: ""},
		{name: "explicit true stores both", proof: &policy.ProofConfig{StoreIP: &yes, StoreUserAgent: &yes}, wantIP: "203.0.113.0", wantAgent: "probe/1"},
		{name: "both false stores neither", proof: &policy.ProofConfig{StoreIP: &no, StoreUserAgent: &no}, wantIP: "", wantAgent: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := api.DefaultConfig()
			cfg.PolicyPacks = proofPack(tt.proof)

			h := newHarness(t, cfg)
			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
				auth(h.key(), "cf-ipcountry", "DE", "X-Forwarded-For", "203.0.113.55", "User-Agent", "probe/1"))
			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			for _, collection := range []string{"consent", "auditLog"} {
				stored, err := h.app.FindFirstRecordByFilter(collection, "id != ''", nil)
				if err != nil {
					t.Fatalf("find %s: %v", collection, err)
				}
				if got := stored.GetString("ipAddress"); got != tt.wantIP {
					t.Errorf("%s ipAddress = %q, want %q", collection, got, tt.wantIP)
				}
				if got := stored.GetString("userAgent"); got != tt.wantAgent {
					t.Errorf("%s userAgent = %q, want %q", collection, got, tt.wantAgent)
				}
			}
		})
	}
}

func TestConsentStoresTheNoticeAsShown(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.PolicyPacks = proofPack(nil)

	h := newHarness(t, cfg)
	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(h.key(), "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("runtimePolicyDecision", "id != ''", nil)
	if err != nil {
		t.Fatalf("find decision: %v", err)
	}

	if got := stored.GetString("language"); got != "de" {
		t.Errorf("language = %q, want de", got)
	}

	var i18n map[string]any
	if err := stored.UnmarshalJSONField("policyI18n", &i18n); err != nil || i18n["language"] != "de" {
		t.Errorf("policyI18n = %v (%v), want language de", i18n, err)
	}

	var preselected []string
	if err := stored.UnmarshalJSONField("preselectedCategories", &preselected); err != nil || len(preselected) != 1 || preselected[0] != "necessary" {
		t.Errorf("preselectedCategories = %v (%v), want [necessary]", preselected, err)
	}

	var banner map[string]any
	if err := stored.UnmarshalJSONField("bannerUi", &banner); err != nil || banner["scrollLock"] != true {
		t.Errorf("bannerUi = %v (%v), want scrollLock true", banner, err)
	}
}

func TestConfiguredIPHeadersDecideTheStoredAddressAndTheBucket(t *testing.T) {
	cfg := rateLimitedConfig()
	cfg.IPHeaders = []string{"x-real-ip"}

	h := newHarness(t, cfg)
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE", "X-Real-IP", "203.0.113.55", "X-Forwarded-For", "198.51.100.77"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}
	if got := stored.GetString("ipAddress"); got != "203.0.113.0" {
		t.Errorf("ipAddress = %q, want the x-real-ip address, masked: an untrusted header must not be stored", got)
	}

	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"
	for i := range 2 {
		spoof := "198.51.100." + strconv.Itoa(i+1)
		if rec := h.do(http.MethodGet, url, "", auth(key, "X-Real-IP", "203.0.113.55", "X-Forwarded-For", spoof)); rec.Code != http.StatusOK {
			t.Fatalf("request %d status = %d: %s", i+1, rec.Code, rec.Body.String())
		}
	}
	if rec := h.do(http.MethodGet, url, "", auth(key, "X-Real-IP", "203.0.113.55", "X-Forwarded-For", "198.51.100.3")); rec.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d, want 429: rotating an untrusted header must not give a fresh bucket", rec.Code)
	}
}

func TestDecisionRecordsThePackThatApplied(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(h.key(), "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	decision, err := h.app.FindFirstRecordByFilter("runtimePolicyDecision", "id != ''", nil)
	if err != nil {
		t.Fatalf("find decision: %v", err)
	}
	if got := decision.GetString("packId"); got != "europe_opt_in" {
		t.Errorf("packId = %q, want the pack that applied, europe_opt_in", got)
	}
}

func TestLegalDocumentConsentIsNotAttachedToABannerDecision(t *testing.T) {
	h := newHarness(t, snapshotConfig(true))
	key := h.key()

	docID := publishDocument(t, h, key, "privacy_policy", "1.0.0", "abc")

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+docID+`"}`,
		auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: a required cookie-policy snapshot does not apply to a legal document: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}

	if got := stored.GetString("runtimePolicyDecision"); got != "" {
		t.Errorf("runtimePolicyDecision = %q, want none: the user did not see a banner policy", got)
	}
	if got := stored.GetString("runtimePolicySource"); got != "" {
		t.Errorf("runtimePolicySource = %q, want empty", got)
	}
	if !stored.GetDateTime("validUntil").IsZero() {
		t.Errorf("validUntil = %v, want none: a banner policy's expiry must not expire a legal document", stored.GetDateTime("validUntil"))
	}
	if got := stored.GetString("policy"); got != docID {
		t.Errorf("policy = %q, want the legal document %q", got, docID)
	}
	if got := stored.GetString("jurisdiction"); got != "GDPR" {
		t.Errorf("jurisdiction = %q, want GDPR from the request location", got)
	}
	if got := h.count("runtimePolicyDecision"); got != 0 {
		t.Errorf("decision rows = %d, want 0", got)
	}
}

func TestLegalDocumentConsentNeedsNoBannerPolicy(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.PolicyPacks = []policy.Config{}

	h := newHarness(t, cfg)
	key := h.key()

	docID := publishDocument(t, h, key, "privacy_policy", "1.0.0", "abc")

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+docID+`"}`,
		auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201 with no banner pack configured: %s", rec.Code, rec.Body.String())
	}
}

func TestConsentReusesSubjectAndDomain(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	for i := range 3 {
		givenAt := time.Date(2026, 3, 1, 12, i, 0, 0, time.UTC).Format(time.RFC3339)
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"`+givenAt+`","externalId":"same-user","domain":"example.com","categories":["necessary"]}`,
			auth(key, "cf-ipcountry", "DE"),
		)
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
	}

	if got := h.count("subject"); got != 1 {
		t.Errorf("subject rows = %d, want 1 reused subject", got)
	}
	if got := h.count("domain"); got != 1 {
		t.Errorf("domain rows = %d, want 1 reused domain", got)
	}
	if got := h.count("consent"); got != 3 {
		t.Errorf("consent rows = %d, want 3", got)
	}
}

func TestWritesAreStampedWithConfiguredTenant(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.TenantID = "acme"

	h := newHarness(t, cfg)
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	for _, table := range []string{"consent", "subject", "domain", "consentPurpose", "consentPolicy", "runtimePolicyDecision", "auditLog"} {
		var n int
		if err := h.app.DB().NewQuery(
			"SELECT count(*) FROM " + table + " WHERE tenantId = 'acme'",
		).Row(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if n == 0 {
			t.Errorf("%s has no row stamped with the configured tenant", table)
		}
	}
}

func TestReadsAreScopedToConfiguredTenant(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.TenantID = "acme"

	h := newHarness(t, cfg)
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	// A row belonging to another deployment must never be visible, even if it
	// somehow shares this database.
	if _, err := h.app.DB().NewQuery(
		"UPDATE consent SET tenantId = 'other' WHERE subject = {:subject}",
	).Bind(dbx.Params{"subject": subjectID}).Execute(); err != nil {
		t.Fatalf("restamp: %v", err)
	}

	rec = h.do(http.MethodGet, "/api/c15t/consent/"+subjectID, "", auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	consents, _ := decode(t, rec)["consents"].([]any)
	if len(consents) != 0 {
		t.Errorf("consents = %d, want 0 for a foreign tenant's row", len(consents))
	}
}

func TestListConsentRequiresAuth(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	rec := h.do(http.MethodGet, "/api/c15t/consent/anything", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func ptrTo[T any](v T) *T { return &v }

func strictPack() []policy.Config {
	strict := policy.ScopeStrict
	model := policy.ModelOptIn

	return []policy.Config{
		{
			ID:    "strict_eu",
			Match: policy.MatchCountries([]string{"DE"}),
			Consent: &policy.ConsentConfig{
				Model:      &model,
				ScopeMode:  &strict,
				Categories: []string{"necessary"},
			},
		},
		policy.PresetWorldNoBanner(),
	}
}

func TestConsentPolicyType(t *testing.T) {
	tests := []struct {
		name       string
		policyType string
		want       int
	}{
		{name: "default when omitted", policyType: "", want: http.StatusCreated},
		{name: "legal document without proof", policyType: "privacy_policy", want: http.StatusConflict},
		{name: "suffixed legal document without proof", policyType: "terms_and_conditions_b2b", want: http.StatusConflict},
		{name: "age verification", policyType: "age_verification", want: http.StatusCreated},
		{name: "unknown type", policyType: "shrug", want: http.StatusBadRequest},
		{name: "empty suffix", policyType: "terms_and_conditions_", want: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			key := h.key()

			body := `{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]`
			if tt.policyType != "" {
				body += `,"policyType":"` + tt.policyType + `"`
			}
			body += `}`

			rec := h.do(http.MethodPost, "/api/c15t/consent", body, auth(key, "cf-ipcountry", "DE"))
			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body.String())
			}
		})
	}
}

func TestConsentPolicyRowReuse(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	for _, ext := range []string{"a", "b", "c"} {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"2026-03-01T12:00:00Z","externalId":"`+ext+`","domain":"example.com","categories":["necessary"]}`,
			auth(key, "cf-ipcountry", "DE"),
		)
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
	}

	if got := h.count("consentPolicy"); got != 1 {
		t.Errorf("consentPolicy rows = %d, want 1 reused active policy", got)
	}

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"d","domain":"example.com","categories":["necessary"],"policyType":"age_verification"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	if got := h.count("consentPolicy"); got != 2 {
		t.Errorf("consentPolicy rows = %d, want a separate row per type", got)
	}
}

func TestConsentPolicyStartsAtVersionOne(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consentPolicy", "id != ''", nil)
	if err != nil {
		t.Fatalf("find policy: %v", err)
	}

	if got := stored.GetString("version"); got != "1.0.0" {
		t.Errorf("version = %q, want 1.0.0", got)
	}
	if got := stored.GetString("type"); got != "cookie_banner" {
		t.Errorf("type = %q, want cookie_banner", got)
	}
	if !stored.GetBool("isActive") {
		t.Error("policy should be active")
	}
}

func TestOnlyOneActivePolicyPerType(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	collection, err := h.app.FindCollectionByNameOrId("consentPolicy")
	if err != nil {
		t.Fatalf("find collection: %v", err)
	}

	for _, version := range []string{"1.0.0", "2.0.0"} {
		record := core.NewRecord(collection)
		record.Set("type", "privacy_policy")
		record.Set("version", version)
		record.Set("effectiveDate", "2026-01-01 00:00:00.000Z")
		record.Set("isActive", true)
		record.Set("tenantId", "t1")

		err := h.app.Save(record)
		if version == "1.0.0" && err != nil {
			t.Fatalf("first active policy rejected: %v", err)
		}
		if version == "2.0.0" && err == nil {
			t.Error("a second active policy of the same type was accepted")
		}
	}
}

func TestConsentIsIdempotent(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	body := `{"externalId":"user-1","domain":"example.com","categories":["necessary"],"givenAt":"2026-03-01T12:00:00Z"}`

	first := h.do(http.MethodPost, "/api/c15t/consent", body, auth(key, "cf-ipcountry", "DE"))
	if first.Code != http.StatusCreated {
		t.Fatalf("first status = %d, want 201: %s", first.Code, first.Body.String())
	}

	second := h.do(http.MethodPost, "/api/c15t/consent", body, auth(key, "cf-ipcountry", "DE"))
	if second.Code != http.StatusOK {
		t.Fatalf("repeat status = %d, want 200: %s", second.Code, second.Body.String())
	}

	firstBody, secondBody := decode(t, first), decode(t, second)
	if firstBody["id"] != secondBody["id"] {
		t.Errorf("repeat returned a different consent: %v vs %v", firstBody["id"], secondBody["id"])
	}
	if secondBody["duplicate"] != true {
		t.Error("repeat was not flagged as a duplicate")
	}

	if got := h.count("consent"); got != 1 {
		t.Errorf("consent rows = %d, want 1 after a repeated submission", got)
	}
	if got := h.count("auditLog"); got != 1 {
		t.Errorf("auditLog rows = %d, want 1, a duplicate must not re-audit", got)
	}
}

func TestClampedSubmissionRetryIsIdempotent(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	const claimed = "2099-01-01T00:00:00Z"
	body := `{"externalId":"user-1","domain":"example.com","categories":["necessary"],"givenAt":"` + claimed + `"}`

	first := h.do(http.MethodPost, "/api/c15t/consent", body, auth(key, "cf-ipcountry", "DE"))
	if first.Code != http.StatusCreated {
		t.Fatalf("first status = %d: %s", first.Code, first.Body.String())
	}

	second := h.do(http.MethodPost, "/api/c15t/consent", body, auth(key, "cf-ipcountry", "DE"))
	if second.Code != http.StatusOK {
		t.Fatalf("retry status = %d, want 200: a clamped retry wrote a new row: %s", second.Code, second.Body.String())
	}
	if decode(t, second)["duplicate"] != true {
		t.Error("retry was not flagged as a duplicate")
	}
	if got := h.count("consent"); got != 1 {
		t.Errorf("consent rows = %d, want 1", got)
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}

	var metadata map[string]any
	if err := stored.UnmarshalJSONField("metadata", &metadata); err != nil {
		t.Fatalf("metadata: %v", err)
	}
	if metadata["clientGivenAt"] != claimed {
		t.Errorf("clientGivenAt = %v, want the client's claim %s", metadata["clientGivenAt"], claimed)
	}
}

func TestUnclampedConsentCarriesNoClientClaim(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"],"givenAt":"2026-01-01T00:00:00Z"}`,
		auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}
	if strings.Contains(stored.GetString("metadata"), "clientGivenAt") {
		t.Errorf("metadata = %s, want no clientGivenAt for an accepted timestamp", stored.GetString("metadata"))
	}
}

func TestConsentRequiresAClientTimestamp(t *testing.T) {
	for name, body := range map[string]string{
		"absent": `{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
		"null":   `{"externalId":"x","domain":"example.com","categories":["necessary"],"givenAt":null}`,
	} {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			rec := h.do(http.MethodPost, "/api/c15t/consent", body, auth(h.key(), "cf-ipcountry", "DE"))
			wantEnvelope(t, rec, http.StatusBadRequest, "INPUT_VALIDATION_FAILED")
			if got := h.count("consent"); got != 0 {
				t.Errorf("consent rows = %d, want 0", got)
			}
		})
	}
}

func TestForgedClientClaimIsNotStored(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"givenAt":"2026-01-01T00:00:00Z","metadata":{"clientGivenAt":"1999-01-01T00:00:00Z","source":"banner"}}`,
		auth(h.key(), "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}
	if strings.Contains(stored.GetString("metadata"), "clientGivenAt") {
		t.Errorf("metadata = %s, want the forged clientGivenAt removed", stored.GetString("metadata"))
	}
	if !strings.Contains(stored.GetString("metadata"), "banner") {
		t.Errorf("metadata = %s, want the other keys kept", stored.GetString("metadata"))
	}
}

func TestConsentRejectsUnrepresentableTimestamps(t *testing.T) {
	for _, givenAt := range []string{"275760-09-14T00:00:00Z", "not-a-date", "-271821-04-20T00:00:00Z"} {
		t.Run(givenAt, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"externalId":"x","domain":"example.com","categories":["necessary"],"givenAt":"`+givenAt+`"}`,
				auth(h.key(), "cf-ipcountry", "DE"))
			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400: %s", rec.Code, rec.Body.String())
			}
			if got := h.count("consent"); got != 0 {
				t.Errorf("consent rows = %d, want 0", got)
			}
		})
	}
}

func TestConsentDistinctSubmissionsAreSeparate(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	bodies := []string{
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"],"givenAt":"2026-03-01T12:00:00Z"}`,
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"],"givenAt":"2026-03-01T12:00:01Z"}`,
		`{"externalId":"user-1","domain":"other.com","categories":["necessary"],"givenAt":"2026-03-01T12:00:00Z"}`,
		`{"externalId":"user-2","domain":"example.com","categories":["necessary"],"givenAt":"2026-03-01T12:00:00Z"}`,
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"],"givenAt":"2026-03-01T12:00:00Z","policyType":"age_verification"}`,
	}

	for i, body := range bodies {
		rec := h.do(http.MethodPost, "/api/c15t/consent", body, auth(key, "cf-ipcountry", "DE"))
		if rec.Code != http.StatusCreated {
			t.Fatalf("body %d status = %d, want 201: %s", i, rec.Code, rec.Body.String())
		}
	}

	if got := h.count("consent"); got != len(bodies) {
		t.Errorf("consent rows = %d, want %d distinct submissions", got, len(bodies))
	}
}

func TestConsentClientTime(t *testing.T) {
	tests := []struct {
		name    string
		givenAt string
		check   func(t *testing.T, got time.Time, now time.Time)
	}{
		{
			name:    "past timestamp is preserved",
			givenAt: "2026-01-01T00:00:00Z",
			check: func(t *testing.T, got, _ time.Time) {
				want := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
				if !got.Equal(want) {
					t.Errorf("givenAt = %v, want %v preserved", got, want)
				}
			},
		},
		{
			name:    "far future is clamped to server time",
			givenAt: "2099-01-01T00:00:00Z",
			check: func(t *testing.T, got, now time.Time) {
				if got.After(now.Add(time.Minute)) {
					t.Errorf("givenAt = %v, want clamping to about %v", got, now)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			key := h.key()
			now := time.Now().UTC()

			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"externalId":"x","domain":"example.com","categories":["necessary"],"givenAt":"`+tt.givenAt+`"}`,
				auth(key, "cf-ipcountry", "DE"),
			)
			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
			if err != nil {
				t.Fatalf("find consent: %v", err)
			}

			tt.check(t, stored.GetDateTime("givenAt").Time().UTC(), now)
		})
	}
}

func TestCheckConsentValidation(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	tests := []struct {
		name string
		url  string
		want int
	}{
		{name: "missing both", url: "/api/c15t/consents/check", want: http.StatusBadRequest},
		{name: "missing type", url: "/api/c15t/consents/check?externalId=x", want: http.StatusBadRequest},
		{name: "missing external id", url: "/api/c15t/consents/check?type=cookie_banner", want: http.StatusBadRequest},
		{name: "empty type", url: "/api/c15t/consents/check?externalId=x&type=", want: http.StatusUnprocessableEntity},
		{name: "empty external id", url: "/api/c15t/consents/check?externalId=&type=cookie_banner", want: http.StatusUnprocessableEntity},
		{name: "blank type list", url: "/api/c15t/consents/check?externalId=x&type=,,", want: http.StatusUnprocessableEntity},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := h.do(http.MethodGet, tt.url, "", auth(key))
			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body.String())
			}
		})
	}
}

func TestCheckConsentUnknownExternalIDIsAllFalse(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodGet,
		"/api/c15t/consents/check?externalId=nobody&type=cookie_banner,privacy_policy", "", auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	results, ok := decode(t, rec)["results"].(map[string]any)
	if !ok {
		t.Fatalf("results missing from %s", rec.Body.String())
	}
	if len(results) != 2 {
		t.Fatalf("results = %d, want one entry per requested type", len(results))
	}

	for typeName, raw := range results {
		entry, _ := raw.(map[string]any)
		if entry["hasConsent"] != false || entry["isLatestPolicy"] != false {
			t.Errorf("%s = %v, want both false", typeName, entry)
		}
	}
}

func TestCheckConsentReportsExistingConsent(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	rec = h.do(http.MethodGet,
		"/api/c15t/consents/check?externalId=user-1&type=cookie_banner,privacy_policy", "", auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	results, _ := decode(t, rec)["results"].(map[string]any)

	banner, _ := results["cookie_banner"].(map[string]any)
	if banner["hasConsent"] != true {
		t.Errorf("cookie_banner hasConsent = %v, want true", banner["hasConsent"])
	}
	if banner["isLatestPolicy"] != true {
		t.Errorf("cookie_banner isLatestPolicy = %v, want true", banner["isLatestPolicy"])
	}

	privacy, _ := results["privacy_policy"].(map[string]any)
	if privacy["hasConsent"] != false {
		t.Errorf("privacy_policy hasConsent = %v, want false", privacy["hasConsent"])
	}
}

func TestCheckConsentLeaksNoIdentifiers(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	rec = h.do(http.MethodGet,
		"/api/c15t/consents/check?externalId=user-1&type=cookie_banner", "", auth(key))

	body := rec.Body.String()
	for _, leak := range []string{subjectID, "example.com", "necessary", "ipAddress"} {
		if strings.Contains(body, leak) {
			t.Errorf("check response leaked %q: %s", leak, body)
		}
	}
}

func TestCheckConsentSurfacesStorageFailures(t *testing.T) {
	for _, table := range []string{"subject", "consentPolicy", "consent"} {
		t.Run(table, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			key := h.key()

			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
				auth(key, "cf-ipcountry", "DE"))
			if rec.Code != http.StatusCreated {
				t.Fatalf("seed status = %d: %s", rec.Code, rec.Body.String())
			}

			if _, err := h.app.DB().NewQuery("ALTER TABLE " + table + " RENAME TO " + table + "_gone").Execute(); err != nil {
				t.Fatalf("break %s: %v", table, err)
			}

			rec = h.do(http.MethodGet, "/api/c15t/consents/check?externalId=user-1&type=cookie_banner", "", auth(key))
			wantEnvelope(t, rec, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR")
		})
	}
}

func TestLookupsSurfaceStorageFailures(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	seed := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"))
	if seed.Code != http.StatusCreated {
		t.Fatalf("seed status = %d: %s", seed.Code, seed.Body.String())
	}
	subjectID, _ := decode(t, seed)["subjectId"].(string)

	rename := func(table string) {
		if _, err := h.app.DB().NewQuery("ALTER TABLE " + table + " RENAME TO " + table + "_gone").Execute(); err != nil {
			t.Fatalf("break %s: %v", table, err)
		}
	}

	policyBody := func(ref string) string {
		return `{"givenAt":"2026-03-02T12:00:00Z","externalId":"user-2","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy",` + ref + `}`
	}

	rename("consentPolicy")
	wantEnvelope(t, h.do(http.MethodPost, "/api/c15t/consent", policyBody(`"policyId":"abc"`), auth(key, "cf-ipcountry", "DE")),
		http.StatusInternalServerError, "INTERNAL_SERVER_ERROR")
	wantEnvelope(t, h.do(http.MethodPost, "/api/c15t/consent", policyBody(`"policyHash":"abc"`), auth(key, "cf-ipcountry", "DE")),
		http.StatusInternalServerError, "INTERNAL_SERVER_ERROR")

	rename("subject")
	wantEnvelope(t, h.do(http.MethodGet, "/api/c15t/subjects/"+subjectID, "", auth(key)),
		http.StatusInternalServerError, "INTERNAL_SERVER_ERROR")
	wantEnvelope(t, h.do(http.MethodPatch, "/api/c15t/subjects/"+subjectID, `{"externalId":"user-9"}`, auth(key)),
		http.StatusInternalServerError, "INTERNAL_SERVER_ERROR")
}

func TestCheckConsentRequiresAuth(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	rec := h.do(http.MethodGet, "/api/c15t/consents/check?externalId=x&type=cookie_banner", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func snapshotConfig(required bool) api.Config {
	cfg := api.DefaultConfig()
	cfg.SnapshotSecret = "test-secret"
	cfg.SnapshotRequired = required
	return cfg
}

func TestSnapshotTokenAbsentWithoutSecret(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	if _, present := decode(t, rec)["policySnapshotToken"]; present {
		t.Error("a snapshot token was issued without a configured secret")
	}
}

func TestSnapshotTokenIssuedOnInit(t *testing.T) {
	h := newHarness(t, snapshotConfig(false))
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	token, _ := decode(t, rec)["policySnapshotToken"].(string)
	if token == "" {
		t.Fatal("no snapshot token issued")
	}
	if strings.Count(token, ".") != 2 {
		t.Errorf("token %q is not a three segment jwt", token)
	}
}

func TestSnapshotRoundTrip(t *testing.T) {
	h := newHarness(t, snapshotConfig(true))
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	token, _ := decode(t, rec)["policySnapshotToken"].(string)
	if token == "" {
		t.Fatal("no snapshot token issued")
	}

	rec = h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"`+token+`"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
}

func TestSnapshotRequiredRejectsBadTokens(t *testing.T) {
	tests := []struct {
		name  string
		token string
	}{
		{name: "missing", token: ""},
		{name: "malformed", token: "not-a-jwt"},
		{name: "tampered", token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwb2xpY3lJZCI6IngifQ.AAAA"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, snapshotConfig(true))
			key := h.key()

			body := `{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]`
			if tt.token != "" {
				body += `,"policySnapshotToken":"` + tt.token + `"`
			}
			body += `}`

			rec := h.do(http.MethodPost, "/api/c15t/consent", body, auth(key, "cf-ipcountry", "DE"))
			if rec.Code != http.StatusConflict {
				t.Errorf("status = %d, want 409: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestSnapshotOptionalFallsBackToCurrentPolicy(t *testing.T) {
	h := newHarness(t, snapshotConfig(false))
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"garbage"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201 when snapshots are optional: %s", rec.Code, rec.Body.String())
	}
}

func TestSnapshotIsRecordedAsShown(t *testing.T) {
	h := newHarness(t, snapshotConfig(true))
	key := h.key()

	init := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	initBody := decode(t, init)
	token, _ := initBody["policySnapshotToken"].(string)
	shown, _ := initBody["policyDecision"].(map[string]any)

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"`+token+`"}`,
		auth(key, "x-vercel-ip-country", "US", "x-vercel-ip-country-region", "CA"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: a valid token records what the user was shown: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}
	if got := stored.GetString("jurisdiction"); got != "GDPR" {
		t.Errorf("jurisdiction = %q, want the token's GDPR, not the request's", got)
	}
	if got := stored.GetString("runtimePolicySource"); got != "snapshot_token" {
		t.Errorf("runtimePolicySource = %q, want snapshot_token", got)
	}

	if got := h.count("runtimePolicyDecision"); got != 1 {
		t.Fatalf("decision rows = %d, want 1", got)
	}
	decision, err := h.app.FindFirstRecordByFilter("runtimePolicyDecision", "id != ''", nil)
	if err != nil {
		t.Fatalf("find decision: %v", err)
	}
	if got := decision.GetString("fingerprint"); got != shown["fingerprint"] {
		t.Errorf("decision fingerprint = %q, want the token's %v", got, shown["fingerprint"])
	}
	if got := decision.GetString("countryCode"); got != "DE" {
		t.Errorf("decision countryCode = %q, want the token's DE", got)
	}
}

func TestSnapshotScopeWinsOverTheCurrentPolicy(t *testing.T) {
	strict := policy.ScopeStrict
	model := policy.ModelOptIn

	cfg := snapshotConfig(false)
	cfg.PolicyPacks = []policy.Config{
		{
			ID:    "wide_de",
			Match: policy.MatchCountries([]string{"DE"}),
			Consent: &policy.ConsentConfig{
				Model:      &model,
				ScopeMode:  &strict,
				Categories: []string{"necessary", "marketing"},
			},
		},
		{
			ID:    "narrow_fr",
			Match: policy.MatchCountries([]string{"FR"}),
			Consent: &policy.ConsentConfig{
				Model:      &model,
				ScopeMode:  &strict,
				Categories: []string{"necessary"},
			},
		},
		policy.PresetWorldNoBanner(),
	}

	h := newHarness(t, cfg)
	key := h.key()

	init := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	token, _ := decode(t, init)["policySnapshotToken"].(string)
	if token == "" {
		t.Fatal("init issued no token")
	}

	body := func(extra string) string {
		return `{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary","marketing"]` + extra + `}`
	}

	rec := h.do(http.MethodPost, "/api/c15t/consent", body(""), auth(key, "cf-ipcountry", "FR"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("without a token: status = %d, want 400 under the narrower current policy: %s", rec.Code, rec.Body.String())
	}

	rec = h.do(http.MethodPost, "/api/c15t/consent", body(`,"policySnapshotToken":"`+token+`"`), auth(key, "cf-ipcountry", "FR"))
	if rec.Code != http.StatusCreated {
		t.Errorf("with the token: status = %d, want 201 under the scope the user saw: %s", rec.Code, rec.Body.String())
	}
}

func TestWriteTimeResolutionIsMarkedAsSuch(t *testing.T) {
	h := newHarness(t, snapshotConfig(false))

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(h.key(), "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}
	if got := stored.GetString("runtimePolicySource"); got != "write_time_fallback" {
		t.Errorf("runtimePolicySource = %q, want write_time_fallback", got)
	}
}

func TestStatus(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/status", "",
		auth(key, "cf-ipcountry", "DE", "X-Forwarded-For", "203.0.113.55"))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body["version"] == "" || body["version"] == nil {
		t.Error("version missing")
	}
	if body["timestamp"] == nil {
		t.Error("timestamp missing")
	}

	client, _ := body["client"].(map[string]any)
	if client["ip"] != "203.0.113.0" {
		t.Errorf("ip = %v, want masked", client["ip"])
	}

	region, _ := client["region"].(map[string]any)
	if region["countryCode"] != "DE" {
		t.Errorf("countryCode = %v, want DE", region["countryCode"])
	}
}

func TestStatusReportsUnavailableWhenTheConsentStoreFails(t *testing.T) {
	for _, table := range []string{"subject", "consent", "consentPolicy"} {
		t.Run(table, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			key := h.key()

			if rec := h.do(http.MethodGet, "/api/c15t/status", "", auth(key)); rec.Code != http.StatusOK {
				t.Fatalf("healthy status = %d, want 200 even with empty tables: %s", rec.Code, rec.Body.String())
			}

			if _, err := h.app.DB().NewQuery("ALTER TABLE " + table + " RENAME TO " + table + "_gone").Execute(); err != nil {
				t.Fatalf("break %s: %v", table, err)
			}

			wantEnvelope(t, h.do(http.MethodGet, "/api/c15t/status", "", auth(key)),
				http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE")
		})
	}
}

func TestStatusRequiresAuth(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	rec := h.do(http.MethodGet, "/api/c15t/status", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestGetSubject(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	rec = h.do(http.MethodGet, "/api/c15t/subjects/"+subjectID, "", auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body["id"] != subjectID {
		t.Errorf("id = %v, want %q", body["id"], subjectID)
	}
	if body["externalId"] != "user-1" {
		t.Errorf("externalId = %v", body["externalId"])
	}

	consents, _ := body["consents"].([]any)
	if len(consents) != 1 {
		t.Fatalf("consents = %d, want 1", len(consents))
	}

	item, _ := consents[0].(map[string]any)
	if item["type"] != "cookie_banner" {
		t.Errorf("type = %v, want cookie_banner", item["type"])
	}
	if item["isLatestPolicy"] != true {
		t.Errorf("isLatestPolicy = %v, want true", item["isLatestPolicy"])
	}
}

func TestGetSubjectNotFound(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/subjects/doesnotexist00", "", auth(key))
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestListSubjects(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/subjects", "", auth(key))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 without externalId", rec.Code)
	}

	rec = h.do(http.MethodGet, "/api/c15t/subjects?externalId=", "", auth(key))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422 for an empty externalId", rec.Code)
	}

	if rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	); rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	rec = h.do(http.MethodGet, "/api/c15t/subjects?externalId=user-1", "", auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	subjects, _ := decode(t, rec)["subjects"].([]any)
	if len(subjects) != 1 {
		t.Errorf("subjects = %d, want 1", len(subjects))
	}

	rec = h.do(http.MethodGet, "/api/c15t/subjects?externalId=nobody", "", auth(key))
	subjects, _ = decode(t, rec)["subjects"].([]any)
	if len(subjects) != 0 {
		t.Errorf("subjects = %d, want 0 for an unknown identity", len(subjects))
	}
}

func TestPatchSubject(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	subjectID, _ := decode(t, rec)["subjectId"].(string)
	auditBefore := h.count("auditLog")

	rec = h.do(http.MethodPatch, "/api/c15t/subjects/"+subjectID,
		`{"externalId":"user-renamed","identityProvider":"okta"}`, auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body["externalId"] != "user-renamed" {
		t.Errorf("externalId = %v, want user-renamed", body["externalId"])
	}
	if body["identityProvider"] != "okta" {
		t.Errorf("identityProvider = %v, want okta", body["identityProvider"])
	}

	if got := h.count("auditLog"); got != auditBefore+1 {
		t.Errorf("auditLog rows = %d, want one more after a patch", got)
	}
}

func TestPatchSubjectValidation(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPatch, "/api/c15t/subjects/doesnotexist00",
		`{"externalId":"x"}`, auth(key))
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}

	rec = h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	rec = h.do(http.MethodPatch, "/api/c15t/subjects/"+subjectID, `{}`, auth(key))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 without externalId", rec.Code)
	}
}

func TestSyncLegalDocument(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPut, "/api/c15t/legal-documents/privacy_policy/current",
		`{"version":"1.0.0","hash":"abc","effectiveDate":"2026-01-01T00:00:00Z"}`, auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	policy, _ := decode(t, rec)["policy"].(map[string]any)
	if policy["type"] != "privacy_policy" {
		t.Errorf("type = %v", policy["type"])
	}
	if policy["version"] != "1.0.0" {
		t.Errorf("version = %v", policy["version"])
	}
	if policy["isActive"] != true {
		t.Error("published document should be active")
	}

	rec = h.do(http.MethodPut, "/api/c15t/legal-documents/privacy_policy/current",
		`{"version":"2.0.0","hash":"def","effectiveDate":"2026-06-01T00:00:00Z"}`, auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	active, err := h.app.FindRecordsByFilter("consentPolicy",
		"type = 'privacy_policy' && isActive = true", "", 0, 0, nil)
	if err != nil {
		t.Fatalf("find active: %v", err)
	}
	if len(active) != 1 {
		t.Fatalf("active policies = %d, want exactly 1", len(active))
	}
	if active[0].GetString("version") != "2.0.0" {
		t.Errorf("active version = %q, want 2.0.0", active[0].GetString("version"))
	}
}

func TestSyncLegalDocumentValidation(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	tests := []struct {
		name string
		path string
		body string
		want int
	}{
		{
			name: "unknown type",
			path: "/api/c15t/legal-documents/shrug/current",
			body: `{"version":"1.0.0","hash":"abc","effectiveDate":"2026-01-01T00:00:00Z"}`,
			want: http.StatusBadRequest,
		},
		{
			name: "missing version",
			path: "/api/c15t/legal-documents/privacy_policy/current",
			body: `{"hash":"abc","effectiveDate":"2026-01-01T00:00:00Z"}`,
			want: http.StatusBadRequest,
		},
		{
			name: "missing hash",
			path: "/api/c15t/legal-documents/privacy_policy/current",
			body: `{"version":"1.0.0","effectiveDate":"2026-01-01T00:00:00Z"}`,
			want: http.StatusBadRequest,
		},
		{
			name: "missing effective date",
			path: "/api/c15t/legal-documents/privacy_policy/current",
			body: `{"version":"1.0.0","hash":"abc"}`,
			want: http.StatusBadRequest,
		},
		{
			name: "unparseable effective date",
			path: "/api/c15t/legal-documents/privacy_policy/current",
			body: `{"version":"1.0.0","hash":"abc","effectiveDate":"yesterday"}`,
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "blank version",
			path: "/api/c15t/legal-documents/privacy_policy/current",
			body: `{"version":"","hash":"abc","effectiveDate":"2026-01-01T00:00:00Z"}`,
			want: http.StatusUnprocessableEntity,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := h.do(http.MethodPut, tt.path, tt.body, auth(key))
			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body.String())
			}
		})
	}
}

func TestSyncLegalDocumentIsKeyedOnTheRelease(t *testing.T) {
	put := func(h *harness, key, docType, body string) *httptest.ResponseRecorder {
		return h.do(http.MethodPut, "/api/c15t/legal-documents/"+docType+"/current", body, auth(key))
	}
	release := func(version, hash, date string) string {
		return `{"version":"` + version + `","hash":"` + hash + `","effectiveDate":"` + date + `"}`
	}

	t.Run("only legal document types", func(t *testing.T) {
		h := newHarness(t, api.DefaultConfig())
		wantEnvelope(t, put(h, h.key(), "cookie_banner", release("1.0.0", "abc", "2026-01-01T00:00:00Z")),
			http.StatusBadRequest, "INPUT_VALIDATION_FAILED")
		if got := h.count("consentPolicy"); got != 0 {
			t.Errorf("consentPolicy rows = %d, want 0", got)
		}
	})

	t.Run("suffixed variants are legal documents", func(t *testing.T) {
		h := newHarness(t, api.DefaultConfig())
		if rec := put(h, h.key(), "terms_and_conditions_b2b", release("1.0.0", "abc", "2026-01-01T00:00:00Z")); rec.Code != http.StatusOK {
			t.Errorf("status = %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("the same release with another effective date conflicts", func(t *testing.T) {
		h := newHarness(t, api.DefaultConfig())
		key := h.key()
		put(h, key, "dpa", release("1.0.0", "abc", "2026-01-01T00:00:00Z"))

		wantEnvelope(t, put(h, key, "dpa", release("1.0.0", "abc", "2026-06-01T00:00:00Z")),
			http.StatusConflict, "LEGAL_DOCUMENT_RELEASE_CONFLICT")

		stored, err := h.app.FindFirstRecordByFilter("consentPolicy", "type = 'dpa'", nil)
		if err != nil {
			t.Fatal(err)
		}
		if got := stored.GetDateTime("effectiveDate").Time().Format("2006-01-02"); got != "2026-01-01" {
			t.Errorf("effectiveDate = %s, want it left unchanged by a rejected sync", got)
		}
	})

	t.Run("the same hash under another version conflicts", func(t *testing.T) {
		h := newHarness(t, api.DefaultConfig())
		key := h.key()
		put(h, key, "dpa", release("1.0.0", "abc", "2026-01-01T00:00:00Z"))

		wantEnvelope(t, put(h, key, "dpa", release("2.0.0", "abc", "2026-01-01T00:00:00Z")),
			http.StatusConflict, "LEGAL_DOCUMENT_RELEASE_CONFLICT")
	})

	t.Run("republishing an older release makes it current again", func(t *testing.T) {
		h := newHarness(t, api.DefaultConfig())
		key := h.key()
		first := publishDocument(t, h, key, "dpa", "1.0.0", "abc")
		publishDocument(t, h, key, "dpa", "2.0.0", "def")

		rec := put(h, key, "dpa", release("1.0.0", "abc", "2026-01-01T00:00:00Z"))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}

		active, err := h.app.FindRecordsByFilter("consentPolicy", "type = 'dpa' && isActive = true", "", 0, 0, nil)
		if err != nil || len(active) != 1 || active[0].Id != first {
			t.Errorf("active = %v (%v), want only the republished release %s", active, err, first)
		}
		if got := h.count("consentPolicy"); got != 2 {
			t.Errorf("consentPolicy rows = %d, want 2", got)
		}
	})

	t.Run("a release seen through a token can be made current", func(t *testing.T) {
		h := newHarness(t, docConfig())
		key := h.key()
		publishDocument(t, h, key, "privacy_policy", "2027-01-01", "current")

		token := docToken(t, docSecret, "privacy_policy", "2026-01-01", "sha256:old", time.Now())
		if rec := legalConsent(h, "privacy_policy", token); rec.Code != http.StatusCreated {
			t.Fatalf("consent status = %d: %s", rec.Code, rec.Body.String())
		}

		rec := put(h, key, "privacy_policy", release("2026-01-01", "sha256:old", "2026-01-01T00:00:00Z"))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
		if got := h.count("consentPolicy"); got != 2 {
			t.Errorf("consentPolicy rows = %d, want the existing historical row reused", got)
		}
	})
}

func TestSyncLegalDocumentRejectsHashChange(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	body := `{"version":"1.0.0","hash":"abc","effectiveDate":"2026-01-01T00:00:00Z"}`
	if rec := h.do(http.MethodPut, "/api/c15t/legal-documents/dpa/current", body, auth(key)); rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	rec := h.do(http.MethodPut, "/api/c15t/legal-documents/dpa/current",
		`{"version":"1.0.0","hash":"different","effectiveDate":"2026-01-01T00:00:00Z"}`, auth(key))
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, want 409 when a released version changes content", rec.Code)
	}
}

func publishDocument(t *testing.T, h *harness, key, docType, version, hash string) string {
	t.Helper()

	rec := h.do(http.MethodPut, "/api/c15t/legal-documents/"+docType+"/current",
		`{"version":"`+version+`","hash":"`+hash+`","effectiveDate":"2026-01-01T00:00:00Z"}`, auth(key))
	if rec.Code != http.StatusOK {
		t.Fatalf("publish %s: status = %d: %s", docType, rec.Code, rec.Body.String())
	}

	policy, _ := decode(t, rec)["policy"].(map[string]any)
	id, _ := policy["id"].(string)
	return id
}

func TestLegalDocumentConsentAcceptsExplicitPolicyID(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()
	policyID := publishDocument(t, h, key, "privacy_policy", "1.0.0", "abc")

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+policyID+`"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
}

func TestLegalDocumentConsentAcceptsPolicyHash(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()
	publishDocument(t, h, key, "privacy_policy", "1.0.0", "abc")

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyHash":"abc"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
}

func TestConsentPolicyReferenceErrors(t *testing.T) {
	tests := []struct {
		name string
		ref  string
		want int
	}{
		{name: "unknown policy id", ref: `"policyId":"doesnotexist00"`, want: http.StatusNotFound},
		{name: "unknown policy hash", ref: `"policyHash":"nosuchhash"`, want: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, api.DefaultConfig())
			key := h.key()

			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy",`+tt.ref+`}`,
				auth(key, "cf-ipcountry", "DE"),
			)
			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body.String())
			}
		})
	}
}

func TestConsentRejectsInactivePolicy(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	retired := publishDocument(t, h, key, "privacy_policy", "1.0.0", "abc")
	publishDocument(t, h, key, "privacy_policy", "2.0.0", "def")

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+retired+`"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for a retired policy: %s", rec.Code, rec.Body.String())
	}
}

func TestLegalDocumentConsentStillNeedsProofWhenOnlyThePolicySignerIsConfigured(t *testing.T) {
	h := newHarness(t, snapshotConfig(false))
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	wantEnvelope(t, rec, http.StatusConflict, "LEGAL_DOCUMENT_PROOF_REQUIRED")
}

const docSecret = "doc-secret"

func docConfig() api.Config {
	cfg := api.DefaultConfig()
	cfg.LegalDocSnapshotSecret = docSecret
	return cfg
}

func docToken(t *testing.T, secret, docType, version, hash string, issuedAt time.Time) string {
	t.Helper()

	token, err := docsnapshot.NewSigner(secret, "", "", 0).Sign(docsnapshot.Payload{
		Type:          docType,
		Version:       version,
		Hash:          hash,
		EffectiveDate: "2026-01-01T00:00:00.000Z",
	}, issuedAt)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return token
}

func legalConsent(h *harness, docType, token string) *httptest.ResponseRecorder {
	extra := ""
	if token != "" {
		extra = `,"documentSnapshotToken":"` + token + `"`
	}
	return h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"`+docType+`"`+extra+`}`,
		auth(h.key(), "cf-ipcountry", "DE"))
}

func TestLegalDocumentTokenRecordsTheReleaseShown(t *testing.T) {
	h := newHarness(t, docConfig())
	key := h.key()

	publishDocument(t, h, key, "privacy_policy", "2027-01-01", "current")

	token := docToken(t, docSecret, "privacy_policy", "2026-01-01", "sha256:old", time.Now())
	rec := legalConsent(h, "privacy_policy", token)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}
	policyRecord, err := h.app.FindRecordById("consentPolicy", stored.GetString("policy"))
	if err != nil {
		t.Fatalf("find policy: %v", err)
	}

	if policyRecord.GetString("hash") != "sha256:old" || policyRecord.GetString("version") != "2026-01-01" {
		t.Errorf("consent is on %s/%s, want the release the token names, not the active one",
			policyRecord.GetString("version"), policyRecord.GetString("hash"))
	}
	if policyRecord.GetBool("isActive") {
		t.Error("a historical release must be recorded inactive, not promoted")
	}

	active, err := h.app.FindFirstRecordByFilter("consentPolicy", "type = 'privacy_policy' && isActive = true", nil)
	if err != nil || active.GetString("hash") != "current" {
		t.Errorf("the active release changed: %v (%v)", active, err)
	}

	again := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-02T12:00:00Z","externalId":"y","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","documentSnapshotToken":"`+token+`"}`,
		auth(key, "cf-ipcountry", "DE"))
	if again.Code != http.StatusCreated {
		t.Fatalf("second consent status = %d: %s", again.Code, again.Body.String())
	}
	if got := h.count("consentPolicy"); got != 2 {
		t.Errorf("consentPolicy rows = %d, want 2 (the active release and one historical release, reused)", got)
	}
}

func TestLegalDocumentTokenIsRequiredWhenConfigured(t *testing.T) {
	good := func(t *testing.T) string {
		return docToken(t, docSecret, "privacy_policy", "2026-01-01", "sha256:old", time.Now())
	}

	tests := []struct {
		name  string
		token func(t *testing.T) string
		want  string
	}{
		{name: "missing", token: func(*testing.T) string { return "" }, want: "LEGAL_DOCUMENT_SNAPSHOT_REQUIRED"},
		{name: "malformed", token: func(*testing.T) string { return "not-a-jwt" }, want: "LEGAL_DOCUMENT_SNAPSHOT_INVALID"},
		{name: "another secret", token: func(t *testing.T) string {
			return docToken(t, "other", "privacy_policy", "2026-01-01", "sha256:old", time.Now())
		}, want: "LEGAL_DOCUMENT_SNAPSHOT_INVALID"},
		{name: "expired", token: func(t *testing.T) string {
			return docToken(t, docSecret, "privacy_policy", "2026-01-01", "sha256:old", time.Now().Add(-time.Hour))
		}, want: "LEGAL_DOCUMENT_SNAPSHOT_EXPIRED"},
		{name: "another document type", token: func(t *testing.T) string {
			return docToken(t, docSecret, "dpa", "2026-01-01", "sha256:old", time.Now())
		}, want: "LEGAL_DOCUMENT_SNAPSHOT_INVALID"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, docConfig())
			wantEnvelope(t, legalConsent(h, "privacy_policy", tt.token(t)), http.StatusConflict, tt.want)
			if got := h.count("consent"); got != 0 {
				t.Errorf("consent rows = %d, want 0", got)
			}
		})
	}

	t.Run("a policy reference does not replace the token", func(t *testing.T) {
		h := newHarness(t, docConfig())
		docID := publishDocument(t, h, h.key(), "privacy_policy", "1.0.0", "abc")

		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+docID+`"}`,
			auth(h.key(), "cf-ipcountry", "DE"))
		wantEnvelope(t, rec, http.StatusConflict, "LEGAL_DOCUMENT_SNAPSHOT_REQUIRED")
	})

	t.Run("a valid token is accepted", func(t *testing.T) {
		h := newHarness(t, docConfig())
		if rec := legalConsent(h, "privacy_policy", good(t)); rec.Code != http.StatusCreated {
			t.Errorf("status = %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestLegalDocumentTokenForAConflictingReleaseIsRejected(t *testing.T) {
	h := newHarness(t, docConfig())
	publishDocument(t, h, h.key(), "privacy_policy", "2026-01-01", "sha256:published")

	token := docToken(t, docSecret, "privacy_policy", "2026-01-01", "sha256:different", time.Now())
	wantEnvelope(t, legalConsent(h, "privacy_policy", token), http.StatusConflict, "LEGAL_DOCUMENT_RELEASE_CONFLICT")
}

func TestPolicyReferencesApplyOnlyToLegalDocuments(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"],"policyId":"doesnotexist00","policyHash":"nosuchhash"}`,
		auth(h.key(), "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201: a cookie consent ignores a policy reference: %s", rec.Code, rec.Body.String())
	}
}

func TestSnapshotPayloadCarriesPolicyDetail(t *testing.T) {
	h := newHarness(t, snapshotConfig(false))
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	token, _ := decode(t, rec)["policySnapshotToken"].(string)
	if token == "" {
		t.Fatal("no snapshot token issued")
	}

	segments := strings.Split(token, ".")
	raw, err := base64.RawURLEncoding.DecodeString(segments[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}

	for _, field := range []string{
		"iss", "aud", "sub", "policyId", "fingerprint", "matchedBy",
		"jurisdiction", "model", "expiryDays", "scopeMode", "uiMode",
		"bannerUi", "dialogUi", "proofConfig", "iat", "exp",
	} {
		if _, present := payload[field]; !present {
			t.Errorf("snapshot payload missing %q", field)
		}
	}

	if payload["uiMode"] != "banner" {
		t.Errorf("uiMode = %v, want banner", payload["uiMode"])
	}
	if payload["country"] != "DE" {
		t.Errorf("country = %v, want DE", payload["country"])
	}
}

func TestScopeHidesForeignRowsFromEveryReadPath(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.TenantID = "acme"

	h := newHarness(t, cfg)
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	// Simulate rows written by another deployment sharing this database.
	for _, table := range []string{"consent", "subject", "domain", "consentPolicy"} {
		if _, err := h.app.DB().NewQuery(
			"UPDATE " + table + " SET tenantId = 'other'",
		).Execute(); err != nil {
			t.Fatalf("restamp %s: %v", table, err)
		}
	}

	t.Run("list consent", func(t *testing.T) {
		rec := h.do(http.MethodGet, "/api/c15t/consent/"+subjectID, "", auth(key))
		consents, _ := decode(t, rec)["consents"].([]any)
		if len(consents) != 0 {
			t.Errorf("consents = %d, want 0", len(consents))
		}
	})

	t.Run("get subject", func(t *testing.T) {
		rec := h.do(http.MethodGet, "/api/c15t/subjects/"+subjectID, "", auth(key))
		if rec.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", rec.Code)
		}
	})

	t.Run("list subjects", func(t *testing.T) {
		rec := h.do(http.MethodGet, "/api/c15t/subjects?externalId=user-1", "", auth(key))
		subjects, _ := decode(t, rec)["subjects"].([]any)
		if len(subjects) != 0 {
			t.Errorf("subjects = %d, want 0", len(subjects))
		}
	})

	t.Run("check consent", func(t *testing.T) {
		rec := h.do(http.MethodGet,
			"/api/c15t/consents/check?externalId=user-1&type=cookie_banner", "", auth(key))
		results, _ := decode(t, rec)["results"].(map[string]any)
		entry, _ := results["cookie_banner"].(map[string]any)
		if entry["hasConsent"] != false {
			t.Error("a foreign tenant's consent was reported")
		}
	})

	t.Run("patch subject", func(t *testing.T) {
		rec := h.do(http.MethodPatch, "/api/c15t/subjects/"+subjectID,
			`{"externalId":"renamed"}`, auth(key))
		if rec.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", rec.Code)
		}
	})
}

func TestPublishableKeyReachesBannerEndpoints(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.publishableKey()

	t.Run("init", func(t *testing.T) {
		rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want 200: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("record consent", func(t *testing.T) {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
			auth(key, "cf-ipcountry", "DE"))
		if rec.Code != http.StatusCreated {
			t.Errorf("status = %d, want 201: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("check consent", func(t *testing.T) {
		rec := h.do(http.MethodGet,
			"/api/c15t/consents/check?externalId=x&type=cookie_banner", "", auth(key))
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want 200: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("status", func(t *testing.T) {
		rec := h.do(http.MethodGet, "/api/c15t/status", "", auth(key))
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want 200: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestPublishableKeyCannotReachPersonalData(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	secret := h.key()
	publishable := h.publishableKey()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(secret, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("seed: status = %d: %s", rec.Code, rec.Body.String())
	}
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	tests := []struct {
		name   string
		method string
		url    string
		body   string
	}{
		{name: "list subjects", method: http.MethodGet, url: "/api/c15t/subjects?externalId=user-1"},
		{name: "get subject", method: http.MethodGet, url: "/api/c15t/subjects/" + subjectID},
		{name: "list consent", method: http.MethodGet, url: "/api/c15t/consent/" + subjectID},
		{
			name:   "patch subject",
			method: http.MethodPatch,
			url:    "/api/c15t/subjects/" + subjectID,
			body:   `{"externalId":"hijacked"}`,
		},
		{
			name:   "publish legal document",
			method: http.MethodPut,
			url:    "/api/c15t/legal-documents/privacy_policy/current",
			body:   `{"version":"9.9.9","effectiveDate":"2026-01-01T00:00:00Z"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := h.do(tt.method, tt.url, tt.body, auth(publishable))
			if rec.Code != http.StatusForbidden {
				t.Errorf("status = %d, want 403: %s", rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "user-1") {
				t.Errorf("response leaked subject data: %s", rec.Body.String())
			}
		})
	}
}

func TestSecretKeyReachesEverything(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	for _, url := range []string{
		"/api/c15t/init",
		"/api/c15t/subjects?externalId=user-1",
		"/api/c15t/subjects/" + subjectID,
		"/api/c15t/consent/" + subjectID,
	} {
		t.Run(url, func(t *testing.T) {
			if rec := h.do(http.MethodGet, url, "", auth(key)); rec.Code != http.StatusOK {
				t.Errorf("status = %d, want 200: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestUnscopedKeyIsRejected(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth("c15t_test_legacykeynoscope"))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 for a key without a scope marker", rec.Code)
	}
}

func TestPublishableKeyIsBoundToOrigins(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.keyWithOrigins(apikey.ScopePublishable, "https://nina.app, https://*.nina.dev")

	tests := []struct {
		name   string
		origin string
		want   int
	}{
		{name: "configured origin", origin: "https://nina.app", want: http.StatusOK},
		{name: "wildcard subdomain", origin: "https://staging.nina.dev", want: http.StatusOK},
		{name: "www of configured origin", origin: "https://www.nina.app", want: http.StatusOK},
		{name: "unlisted origin", origin: "https://evil.com", want: http.StatusForbidden},
		{name: "wildcard bare domain", origin: "https://nina.dev", want: http.StatusForbidden},
		{name: "lookalike domain", origin: "https://evilnina.dev", want: http.StatusForbidden},
		{name: "wrong scheme", origin: "http://nina.app", want: http.StatusForbidden},
		{name: "missing origin", origin: "", want: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			headers := auth(key, "cf-ipcountry", "DE")
			if tt.origin != "" {
				headers["Origin"] = tt.origin
			}

			rec := h.do(http.MethodGet, "/api/c15t/init", "", headers)
			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body.String())
			}
		})
	}
}

func TestPublishableKeyWithoutOriginsIsUnrestricted(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.publishableKey()

	for _, o := range []string{"https://anywhere.com", ""} {
		headers := auth(key, "cf-ipcountry", "DE")
		if o != "" {
			headers["Origin"] = o
		}

		rec := h.do(http.MethodGet, "/api/c15t/init", "", headers)
		if rec.Code != http.StatusOK {
			t.Errorf("origin %q: status = %d, want 200", o, rec.Code)
		}
	}
}

func TestSecretKeyIgnoresOrigin(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.keyWithOrigins(apikey.ScopeSecret, "https://nina.app")

	rec := h.do(http.MethodGet, "/api/c15t/init", "",
		auth(key, "cf-ipcountry", "DE", "Origin", "https://anywhere.com"))
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200: a server side key carries no meaningful Origin", rec.Code)
	}
}

func TestOriginBindingAppliesToConsentWrite(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.keyWithOrigins(apikey.ScopePublishable, "https://nina.app")

	body := `{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"nina.app","categories":["necessary"]}`

	rec := h.do(http.MethodPost, "/api/c15t/consent", body,
		auth(key, "cf-ipcountry", "DE", "Origin", "https://evil.com"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 from an unlisted origin", rec.Code)
	}

	rec = h.do(http.MethodPost, "/api/c15t/consent", body,
		auth(key, "cf-ipcountry", "DE", "Origin", "https://nina.app"))
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201 from the configured origin: %s", rec.Code, rec.Body.String())
	}
}

func rateLimitedConfig() api.Config {
	cfg := api.DefaultConfig()
	cfg.CheckRate = ratelimit.Rule{Limit: 2, Window: time.Minute}
	cfg.WriteRate = ratelimit.Rule{Limit: 2, Window: time.Minute}
	cfg.DefaultRate = ratelimit.Rule{Limit: 3, Window: time.Minute}
	return cfg
}

func TestRateLimitBlocksAfterTheLimit(t *testing.T) {
	h := newHarness(t, rateLimitedConfig())
	key := h.key()

	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"

	for i := range 2 {
		if rec := h.do(http.MethodGet, url, "", auth(key)); rec.Code != http.StatusOK {
			t.Fatalf("request %d status = %d, want 200: %s", i+1, rec.Code, rec.Body.String())
		}
	}

	rec := h.do(http.MethodGet, url, "", auth(key))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("429 response carries no Retry-After header")
	}
}

func TestRateLimitIsPerEndpointClass(t *testing.T) {
	h := newHarness(t, rateLimitedConfig())
	key := h.key()

	check := "/api/c15t/consents/check?externalId=x&type=cookie_banner"
	for range 2 {
		h.do(http.MethodGet, check, "", auth(key))
	}
	if rec := h.do(http.MethodGet, check, "", auth(key)); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("check status = %d, want 429", rec.Code)
	}

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusOK {
		t.Errorf("init status = %d, want 200: exhausting the check budget must not block other endpoints", rec.Code)
	}
}

func TestRateLimitIsPerKey(t *testing.T) {
	h := newHarness(t, rateLimitedConfig())
	first := h.key()
	second := h.key()

	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"

	for range 2 {
		h.do(http.MethodGet, url, "", auth(first))
	}
	if rec := h.do(http.MethodGet, url, "", auth(first)); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("first key status = %d, want 429", rec.Code)
	}

	if rec := h.do(http.MethodGet, url, "", auth(second)); rec.Code != http.StatusOK {
		t.Errorf("second key status = %d, want 200: keys must not share a bucket", rec.Code)
	}
}

func TestRateLimitDisabledByDefaultRule(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.CheckRate = ratelimit.Rule{}

	h := newHarness(t, cfg)
	key := h.key()

	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"
	for i := range 40 {
		if rec := h.do(http.MethodGet, url, "", auth(key)); rec.Code != http.StatusOK {
			t.Fatalf("request %d status = %d, want a zero limit to disable the rule", i+1, rec.Code)
		}
	}
}

func TestRateLimitAppliesToWrites(t *testing.T) {
	h := newHarness(t, rateLimitedConfig())
	key := h.key()

	body := func(i int) string {
		return `{"givenAt":"2026-03-01T12:00:00Z","externalId":"u` + strconv.Itoa(i) + `","domain":"example.com","categories":["necessary"]}`
	}

	for i := range 2 {
		rec := h.do(http.MethodPost, "/api/c15t/consent", body(i), auth(key, "cf-ipcountry", "DE"))
		if rec.Code != http.StatusCreated {
			t.Fatalf("write %d status = %d: %s", i+1, rec.Code, rec.Body.String())
		}
	}

	rec := h.do(http.MethodPost, "/api/c15t/consent", body(99), auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d, want 429", rec.Code)
	}
}

func exhaustCheck(h *harness, key, ip string) {
	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"
	for range 2 {
		h.do(http.MethodGet, url, "", auth(key, "x-forwarded-for", ip))
	}
}

func TestRateLimitSeparatesClientsWhenIPTrackingIsOff(t *testing.T) {
	cfg := rateLimitedConfig()
	cfg.TrackIPDisabled = true

	h := newHarness(t, cfg)
	key := h.key()
	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"

	exhaustCheck(h, key, "203.0.113.7")

	if rec := h.do(http.MethodGet, url, "", auth(key, "x-forwarded-for", "198.51.100.9")); rec.Code != http.StatusOK {
		t.Fatalf("other client status = %d, want 200: callers of one key share a bucket", rec.Code)
	}
	if rec := h.do(http.MethodGet, url, "", auth(key, "x-forwarded-for", "203.0.113.7")); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("same client status = %d, want 429", rec.Code)
	}
}

func TestRateLimitSeparatesNeighboursWhenIPIsMasked(t *testing.T) {
	h := newHarness(t, rateLimitedConfig())
	key := h.key()
	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"

	exhaustCheck(h, key, "203.0.113.7")

	if rec := h.do(http.MethodGet, url, "", auth(key, "x-forwarded-for", "203.0.113.8")); rec.Code != http.StatusOK {
		t.Fatalf("neighbour status = %d, want 200: a /24 shares one bucket", rec.Code)
	}
}

func TestRateLimitFallsBackToThePeerAddress(t *testing.T) {
	h := newHarness(t, rateLimitedConfig())
	key := h.key()
	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"

	for range 2 {
		h.do(http.MethodGet, url, "", auth(key))
	}
	if rec := h.do(http.MethodGet, url, "", auth(key)); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec.Code)
	}
}

// seedConsents writes n distinct consents for one subject, bypassing the write
// endpoint so the rate limiter does not interfere.
func seedConsents(t *testing.T, h *harness, n int) string {
	t.Helper()

	key := h.key()
	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"bulk","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("seed first: status = %d: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	subjectID, _ := body["subjectId"].(string)
	consentID, _ := body["id"].(string)

	template, err := h.app.FindRecordById("consent", consentID)
	if err != nil {
		t.Fatalf("load template: %v", err)
	}

	collection, err := h.app.FindCollectionByNameOrId("consent")
	if err != nil {
		t.Fatalf("find collection: %v", err)
	}

	for i := 1; i < n; i++ {
		clone := core.NewRecord(collection)
		for _, field := range collection.Fields {
			name := field.GetName()
			if name == "id" {
				continue
			}
			clone.Set(name, template.Get(name))
		}
		// submissionKey is a fixed width digest, so vary a fixed width suffix in
		// place rather than appending past its 64 character limit.
		base := template.GetString("submissionKey")
		suffix := fmt.Sprintf("%06d", i)
		clone.Set("submissionKey", base[:len(base)-len(suffix)]+suffix)

		if err := h.app.Save(clone); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	return subjectID
}

func TestListConsentIsNotSilentlyTruncated(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	subjectID := seedConsents(t, h, 250)

	rec := h.do(http.MethodGet, "/api/c15t/consent/"+subjectID, "", auth(h.key()))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	consents, _ := decode(t, rec)["consents"].([]any)
	if len(consents) != 250 {
		t.Errorf("consents = %d, want all 250: a subject's history must not be silently cut", len(consents))
	}
}

func TestSubjectConsentsAreNotSilentlyTruncated(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	subjectID := seedConsents(t, h, 250)

	rec := h.do(http.MethodGet, "/api/c15t/subjects/"+subjectID, "", auth(h.key()))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	consents, _ := decode(t, rec)["consents"].([]any)
	if len(consents) != 250 {
		t.Errorf("consents = %d, want all 250", len(consents))
	}
}

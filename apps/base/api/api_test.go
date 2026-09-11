package api_test

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"thom/api"
	"thom/core/apikey"
	"thom/core/policy"
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

func TestConsentWrite(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"user-1","domain":"example.com","categories":["necessary","measurement"],"uiSource":"banner","action":"accept_all"}`,
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
			body: `{"externalId":"x","domain":"example.com","categories":["necessary"],"uiSource":"telepathy"}`,
			want: http.StatusBadRequest,
		},
		{
			name: "unknown action",
			body: `{"externalId":"x","domain":"example.com","categories":["necessary"],"action":"shrug"}`,
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
		`{"externalId":"rollback","domain":"rollback.com","categories":["necessary"],"action":"bogus"}`,
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

func TestConsentStrictScopeRejectsOutOfScope(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.PolicyPacks = strictPack()

	h := newHarness(t, cfg)
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"x","domain":"example.com","categories":["necessary","marketing"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an out-of-scope category: %s", rec.Code, rec.Body.String())
	}

	rec = h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
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
			`{"externalId":"`+ext+`","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"d","domain":"example.com","categories":["necessary"]}`,
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
				`{"externalId":"x","domain":"example.com","categories":["necessary","marketing","measurement"],"action":"`+tt.action+`"}`,
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
		`{"externalId":"x","domain":"example.com","categories":["necessary","marketing","measurement"],"action":"accept_all"}`,
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
				`{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
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

func TestConsentReusesSubjectAndDomain(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	for range 3 {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"externalId":"same-user","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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

			body := `{"externalId":"x","domain":"example.com","categories":["necessary"]`
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
			`{"externalId":"`+ext+`","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"d","domain":"example.com","categories":["necessary"],"policyType":"age_verification"}`,
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
		`{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
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

func TestConsentOmittedTimeUsesServerClock(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()
	before := time.Now().UTC().Add(-time.Second)

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	stored, err := h.app.FindFirstRecordByFilter("consent", "id != ''", nil)
	if err != nil {
		t.Fatalf("find consent: %v", err)
	}

	got := stored.GetDateTime("givenAt").Time().UTC()
	if got.Before(before) || got.After(time.Now().UTC().Add(time.Second)) {
		t.Errorf("givenAt = %v, want approximately now", got)
	}
}

func TestCheckConsentValidation(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.key()

	tests := []struct {
		name string
		url  string
	}{
		{name: "missing both", url: "/api/c15t/consents/check"},
		{name: "missing type", url: "/api/c15t/consents/check?externalId=x"},
		{name: "missing external id", url: "/api/c15t/consents/check?type=cookie_banner"},
		{name: "blank type list", url: "/api/c15t/consents/check?externalId=x&type=,,"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := h.do(http.MethodGet, tt.url, "", auth(key))
			if rec.Code != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want 422: %s", rec.Code, rec.Body.String())
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"`+token+`"}`,
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

			body := `{"externalId":"x","domain":"example.com","categories":["necessary"]`
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
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"garbage"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201 when snapshots are optional: %s", rec.Code, rec.Body.String())
	}
}

func TestSnapshotForDifferentPolicyIsRejected(t *testing.T) {
	h := newHarness(t, snapshotConfig(true))
	key := h.key()

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
	token, _ := decode(t, rec)["policySnapshotToken"].(string)

	rec = h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"`+token+`"}`,
		auth(key, "x-vercel-ip-country", "US", "x-vercel-ip-country-region", "CA"),
	)
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, want 409 when the resolved policy differs: %s", rec.Code, rec.Body.String())
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422 without externalId", rec.Code)
	}

	if rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
			body: `{"version":"1.0.0","effectiveDate":"2026-01-01T00:00:00Z"}`,
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "missing version",
			path: "/api/c15t/legal-documents/privacy_policy/current",
			body: `{"effectiveDate":"2026-01-01T00:00:00Z"}`,
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "missing effective date",
			path: "/api/c15t/legal-documents/privacy_policy/current",
			body: `{"version":"1.0.0"}`,
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
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+policyID+`"}`,
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
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyHash":"abc"}`,
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
				`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy",`+tt.ref+`}`,
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
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+retired+`"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for a retired policy: %s", rec.Code, rec.Body.String())
	}
}

func TestLegalDocumentConsentAllowedWithSnapshotSigner(t *testing.T) {
	h := newHarness(t, snapshotConfig(false))
	key := h.key()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy"}`,
		auth(key, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201 when a signing key is configured: %s", rec.Code, rec.Body.String())
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
			`{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
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

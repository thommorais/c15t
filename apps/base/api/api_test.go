package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

func (h *harness) key(tenantID string) string {
	h.t.Helper()

	key, err := apikey.Generate(apikey.EnvTest)
	if err != nil {
		h.t.Fatalf("Generate: %v", err)
	}

	collection, err := h.app.FindCollectionByNameOrId("apiKey")
	if err != nil {
		h.t.Fatalf("find apiKey: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("tenantId", tenantID)
	record.Set("keyHash", key.Hash)
	record.Set("env", string(apikey.EnvTest))
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
	key := h.key("t1")

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
	key := h.key("t1")

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
	key := h.key("t1")

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
	key := h.key("t1")

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

	stored, err := h.app.FindFirstRecordByFilter("consent", "tenantId = 't1'", nil)
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
	key := h.key("t1")

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
	key := h.key("t1")

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
	key := h.key("t1")

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
	key := h.key("t1")

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
			key := h.key("t1")

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
	key := h.key("t1")

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
			key := h.key("t1")

			rec := h.do(http.MethodPost, "/api/c15t/consent",
				`{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
				auth(key, "cf-ipcountry", "DE", "X-Forwarded-For", "203.0.113.55"),
			)
			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}

			stored, err := h.app.FindFirstRecordByFilter("consent", "tenantId = 't1'", nil)
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
	key := h.key("t1")

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

func TestTenantIsolation(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	keyOne := h.key("t1")
	keyTwo := h.key("t2")

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(keyOne, "cf-ipcountry", "DE"),
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	t.Run("owner reads its consent", func(t *testing.T) {
		rec := h.do(http.MethodGet, "/api/c15t/consent/"+subjectID, "", auth(keyOne))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
		consents, _ := decode(t, rec)["consents"].([]any)
		if len(consents) != 1 {
			t.Errorf("consents = %d, want 1", len(consents))
		}
	})

	t.Run("other tenant reads nothing", func(t *testing.T) {
		rec := h.do(http.MethodGet, "/api/c15t/consent/"+subjectID, "", auth(keyTwo))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
		consents, _ := decode(t, rec)["consents"].([]any)
		if len(consents) != 0 {
			t.Errorf("consents = %d, want 0 for a foreign tenant", len(consents))
		}
	})

	t.Run("other tenant cannot write to a foreign subject", func(t *testing.T) {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"subjectId":"`+subjectID+`","domain":"example.com","categories":["necessary"]}`,
			auth(keyTwo, "cf-ipcountry", "DE"),
		)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400 for a foreign subject id", rec.Code)
		}
	})

	t.Run("same external id yields separate subjects per tenant", func(t *testing.T) {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
			auth(keyTwo, "cf-ipcountry", "DE"),
		)
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}

		other, _ := decode(t, rec)["subjectId"].(string)
		if other == subjectID {
			t.Error("tenants share a subject for the same external id")
		}
	})
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

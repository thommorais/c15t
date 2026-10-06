package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"thom/api"
)

func wantEnvelope(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()

	if rec.Code != status {
		t.Fatalf("http status = %d, want %d: %s", rec.Code, status, rec.Body.String())
	}

	body := decode(t, rec)
	if body["code"] != code {
		t.Errorf("code = %v, want %s: %s", body["code"], code, rec.Body.String())
	}
	if got, ok := body["status"].(float64); !ok || int(got) != status {
		t.Errorf("status field = %v, want %d", body["status"], status)
	}
	if body["defined"] != true {
		t.Errorf("defined = %v, want true", body["defined"])
	}
	if msg, _ := body["message"].(string); msg == "" {
		t.Error("message is empty")
	}
	if data, ok := body["data"].(map[string]any); !ok || len(data) != 0 {
		t.Errorf("data = %v, want {}", body["data"])
	}
}

func TestErrorEnvelope(t *testing.T) {
	const consentURL = "/api/c15t/consent"
	const checkURL = "/api/c15t/consents/check"

	tests := []struct {
		name   string
		cfg    func() api.Config
		run    func(h *harness) *httptest.ResponseRecorder
		status int
		code   string
	}{
		{
			name: "missing api key",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, "/api/c15t/init", "", nil)
			},
			status: http.StatusUnauthorized, code: "UNAUTHORIZED",
		},
		{
			name: "publishable key on a secret endpoint",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, "/api/c15t/subjects?externalId=x", "", auth(h.publishableKey()))
			},
			status: http.StatusForbidden, code: "FORBIDDEN",
		},
		{
			name: "origin not allowed",
			run: func(h *harness) *httptest.ResponseRecorder {
				key := h.keyWithOrigins("publishable", "https://ok.example")
				return h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "Origin", "https://evil.example"))
			},
			status: http.StatusForbidden, code: "FORBIDDEN",
		},
		{
			name: "malformed body",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPost, consentURL, `{not json`, auth(h.key()))
			},
			status: http.StatusBadRequest, code: "INPUT_VALIDATION_FAILED",
		},
		{
			name: "missing domain",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPost, consentURL, `{"externalId":"x"}`, auth(h.key(), "cf-ipcountry", "DE"))
			},
			status: http.StatusBadRequest, code: "INPUT_VALIDATION_FAILED",
		},
		{
			name: "unknown subject",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, "/api/c15t/subjects/nosuchsubject", "", auth(h.key()))
			},
			status: http.StatusNotFound, code: "SUBJECT_NOT_FOUND",
		},
		{
			name: "patch unknown subject",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPatch, "/api/c15t/subjects/nosuchsubject", `{"externalId":"x"}`, auth(h.key()))
			},
			status: http.StatusNotFound, code: "SUBJECT_NOT_FOUND",
		},
		{
			name: "list without externalId",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, "/api/c15t/subjects", "", auth(h.key()))
			},
			status: http.StatusBadRequest, code: "INPUT_VALIDATION_FAILED",
		},
		{
			name: "list with empty externalId",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, "/api/c15t/subjects?externalId=", "", auth(h.key()))
			},
			status: http.StatusUnprocessableEntity, code: "EXTERNAL_ID_REQUIRED",
		},
		{
			name: "check without externalId",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, checkURL+"?type=cookie_banner", "", auth(h.key()))
			},
			status: http.StatusBadRequest, code: "INPUT_VALIDATION_FAILED",
		},
		{
			name: "check with empty externalId",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, checkURL+"?externalId=&type=cookie_banner", "", auth(h.key()))
			},
			status: http.StatusUnprocessableEntity, code: "EXTERNAL_ID_REQUIRED",
		},
		{
			name: "check without type",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, checkURL+"?externalId=x", "", auth(h.key()))
			},
			status: http.StatusBadRequest, code: "INPUT_VALIDATION_FAILED",
		},
		{
			name: "check with empty type",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, checkURL+"?externalId=x&type=", "", auth(h.key()))
			},
			status: http.StatusUnprocessableEntity, code: "TYPE_REQUIRED",
		},
		{
			name: "unparseable effective date",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPut, "/api/c15t/legal-documents/dpa/current",
					`{"version":"1.0.0","hash":"abc","effectiveDate":"yesterday"}`, auth(h.key()))
			},
			status: http.StatusUnprocessableEntity, code: "INPUT_VALIDATION_FAILED",
		},
		{
			name: "unknown legal document type",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPut, "/api/c15t/legal-documents/shrug/current",
					`{"version":"1.0.0","hash":"abc","effectiveDate":"2026-01-01T00:00:00Z"}`, auth(h.key()))
			},
			status: http.StatusBadRequest, code: "INPUT_VALIDATION_FAILED",
		},
		{
			name: "unknown route",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodGet, "/api/c15t/nope", "", nil)
			},
			status: http.StatusNotFound, code: "NOT_FOUND",
		},
		{
			name: "wrong method on a known route",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodDelete, "/api/c15t/status", "", auth(h.key()))
			},
			status: http.StatusNotFound, code: "NOT_FOUND",
		},
		{
			name: "expired snapshot",
			cfg: func() api.Config {
				cfg := snapshotConfig(true)
				cfg.SnapshotTTL = time.Nanosecond
				return cfg
			},
			run: func(h *harness) *httptest.ResponseRecorder {
				key := h.key()
				init := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
				token, _ := decode(t, init)["policySnapshotToken"].(string)
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"`+token+`"}`,
					auth(key, "cf-ipcountry", "DE"))
			},
			status: http.StatusConflict, code: "POLICY_SNAPSHOT_EXPIRED",
		},
		{
			name: "category outside the policy",
			cfg: func() api.Config {
				cfg := api.DefaultConfig()
				cfg.PolicyPacks = strictPack()
				return cfg
			},
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary","marketing"]}`,
					auth(h.key(), "cf-ipcountry", "DE"))
			},
			status: http.StatusBadRequest, code: "PURPOSE_NOT_ALLOWED",
		},
		{
			name: "unknown policy",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"doesnotexist00"}`,
					auth(h.key(), "cf-ipcountry", "DE"))
			},
			status: http.StatusNotFound, code: "POLICY_NOT_FOUND",
		},
		{
			name: "retired policy",
			run: func(h *harness) *httptest.ResponseRecorder {
				key := h.key()
				retired := publishDocument(t, h, key, "privacy_policy", "1.0.0", "abc")
				publishDocument(t, h, key, "privacy_policy", "2.0.0", "def")
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy","policyId":"`+retired+`"}`,
					auth(key, "cf-ipcountry", "DE"))
			},
			status: http.StatusBadRequest, code: "POLICY_INACTIVE",
		},
		{
			name: "legal document consent without proof",
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary"],"policyType":"privacy_policy"}`,
					auth(h.key(), "cf-ipcountry", "DE"))
			},
			status: http.StatusConflict, code: "LEGAL_DOCUMENT_PROOF_REQUIRED",
		},
		{
			name: "required snapshot missing",
			cfg:  func() api.Config { return snapshotConfig(true) },
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary"]}`,
					auth(h.key(), "cf-ipcountry", "DE"))
			},
			status: http.StatusConflict, code: "POLICY_SNAPSHOT_REQUIRED",
		},
		{
			name: "required snapshot malformed",
			cfg:  func() api.Config { return snapshotConfig(true) },
			run: func(h *harness) *httptest.ResponseRecorder {
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"not-a-jwt"}`,
					auth(h.key(), "cf-ipcountry", "DE"))
			},
			status: http.StatusConflict, code: "POLICY_SNAPSHOT_INVALID",
		},
		{
			name: "snapshot for another policy",
			cfg:  func() api.Config { return snapshotConfig(true) },
			run: func(h *harness) *httptest.ResponseRecorder {
				key := h.key()
				init := h.do(http.MethodGet, "/api/c15t/init", "", auth(key, "cf-ipcountry", "DE"))
				token, _ := decode(t, init)["policySnapshotToken"].(string)
				return h.do(http.MethodPost, consentURL,
					`{"externalId":"x","domain":"example.com","categories":["necessary"],"policySnapshotToken":"`+token+`"}`,
					auth(key, "x-vercel-ip-country", "US", "x-vercel-ip-country-region", "CA"))
			},
			status: http.StatusConflict, code: "POLICY_SNAPSHOT_INVALID",
		},
		{
			name: "released version changes content",
			run: func(h *harness) *httptest.ResponseRecorder {
				key := h.key()
				url := "/api/c15t/legal-documents/dpa/current"
				h.do(http.MethodPut, url, `{"version":"1.0.0","hash":"abc","effectiveDate":"2026-01-01T00:00:00Z"}`, auth(key))
				return h.do(http.MethodPut, url, `{"version":"1.0.0","hash":"different","effectiveDate":"2026-01-01T00:00:00Z"}`, auth(key))
			},
			status: http.StatusConflict, code: "LEGAL_DOCUMENT_RELEASE_CONFLICT",
		},
		{
			name: "rate limited",
			cfg:  rateLimitedConfig,
			run: func(h *harness) *httptest.ResponseRecorder {
				key := h.key()
				for range 2 {
					h.do(http.MethodGet, checkURL+"?externalId=x&type=cookie_banner", "", auth(key))
				}
				return h.do(http.MethodGet, checkURL+"?externalId=x&type=cookie_banner", "", auth(key))
			},
			status: http.StatusTooManyRequests, code: "RATE_LIMITED",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := api.DefaultConfig()
			if tt.cfg != nil {
				cfg = tt.cfg()
			}
			h := newHarness(t, cfg)
			wantEnvelope(t, tt.run(h), tt.status, tt.code)
		})
	}
}

func TestRateLimitEnvelopeKeepsRetryAfter(t *testing.T) {
	h := newHarness(t, rateLimitedConfig())
	key := h.key()
	url := "/api/c15t/consents/check?externalId=x&type=cookie_banner"
	for range 2 {
		h.do(http.MethodGet, url, "", auth(key))
	}
	if rec := h.do(http.MethodGet, url, "", auth(key)); rec.Header().Get("Retry-After") == "" {
		t.Error("429 carries no Retry-After header")
	}
}

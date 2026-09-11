package sdk_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"thom/api"
	"thom/core/apikey"
	_ "thom/migrations"
	"thom/sdk"
)

func newServer(t *testing.T) (*sdk.Client, *tests.TestApp) {
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
	api.Register(app, &core.ServeEvent{App: app, Router: pbRouter}, api.DefaultConfig())

	mux, err := pbRouter.BuildMux()
	if err != nil {
		t.Fatalf("BuildMux: %v", err)
	}

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	client, err := sdk.New(srv.URL, mintKey(t, app))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	return client, app
}

func mintKey(t *testing.T, app *tests.TestApp) string {
	t.Helper()

	key, err := apikey.Generate(apikey.EnvTest, apikey.ScopeSecret)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	collection, err := app.FindCollectionByNameOrId("apiKey")
	if err != nil {
		t.Fatalf("find apiKey: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("keyHash", key.Hash)
	record.Set("env", string(apikey.EnvTest))
	record.Set("scope", string(apikey.ScopeSecret))
	record.Set("revoked", false)

	if err := app.Save(record); err != nil {
		t.Fatalf("save apiKey: %v", err)
	}

	return key.Secret
}

func TestNewValidation(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
		apiKey  string
	}{
		{name: "missing base url", baseURL: "", apiKey: "k"},
		{name: "missing api key", baseURL: "http://localhost", apiKey: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := sdk.New(tt.baseURL, tt.apiKey); err == nil {
				t.Error("expected an error")
			}
		})
	}
}

func TestNewTrimsTrailingSlash(t *testing.T) {
	client, err := sdk.New("http://localhost:8090/", "key")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if client == nil {
		t.Fatal("expected a client")
	}
}

func TestInit(t *testing.T) {
	client, _ := newServer(t)

	tests := []struct {
		name             string
		geo              sdk.GeoHints
		wantJurisdiction string
		wantPolicy       string
		wantMatchedBy    string
	}{
		{
			name:             "germany",
			geo:              sdk.GeoHints{CountryCode: "DE"},
			wantJurisdiction: "GDPR",
			wantPolicy:       "europe_opt_in",
			wantMatchedBy:    "country",
		},
		{
			name:             "california",
			geo:              sdk.GeoHints{CountryCode: "US", RegionCode: "CA"},
			wantJurisdiction: "CCPA",
			wantPolicy:       "california_opt_out",
			wantMatchedBy:    "region",
		},
		{
			name:             "unknown geo",
			geo:              sdk.GeoHints{},
			wantJurisdiction: "NONE",
			wantPolicy:       "europe_opt_in",
			wantMatchedBy:    "fallback",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := client.Init(context.Background(), tt.geo)
			if err != nil {
				t.Fatalf("Init: %v", err)
			}

			if got.Jurisdiction != tt.wantJurisdiction {
				t.Errorf("jurisdiction = %q, want %q", got.Jurisdiction, tt.wantJurisdiction)
			}
			if got.Policy == nil {
				t.Fatal("policy missing")
			}
			if got.Policy.ID != tt.wantPolicy {
				t.Errorf("policy id = %q, want %q", got.Policy.ID, tt.wantPolicy)
			}
			if got.Decision == nil {
				t.Fatal("decision missing")
			}
			if got.Decision.MatchedBy != tt.wantMatchedBy {
				t.Errorf("matchedBy = %q, want %q", got.Decision.MatchedBy, tt.wantMatchedBy)
			}
			if len(got.Decision.Fingerprint) != 64 {
				t.Errorf("fingerprint = %q, want 64 hex chars", got.Decision.Fingerprint)
			}
		})
	}
}

func TestInitParsesConsentConfig(t *testing.T) {
	client, _ := newServer(t)

	got, err := client.Init(context.Background(), sdk.GeoHints{CountryCode: "DE"})
	if err != nil {
		t.Fatalf("Init: %v", err)
	}

	if got.Policy.Consent == nil {
		t.Fatal("consent config missing")
	}
	if got.Policy.Consent.ExpiryDays == nil || *got.Policy.Consent.ExpiryDays != 365 {
		t.Errorf("expiryDays = %v, want 365", got.Policy.Consent.ExpiryDays)
	}
	if got.Policy.Consent.ScopeMode != "permissive" {
		t.Errorf("scopeMode = %q, want permissive", got.Policy.Consent.ScopeMode)
	}
}

func TestRecordConsent(t *testing.T) {
	client, _ := newServer(t)

	got, err := client.RecordConsent(context.Background(), sdk.ConsentRequest{
		ExternalID: "user-1",
		Domain:     "example.com",
		Categories: []string{"necessary", "measurement"},
		UISource:   "banner",
		Action:     "accept_all",
	}, sdk.GeoHints{CountryCode: "DE", ForwardedIP: "203.0.113.55"})
	if err != nil {
		t.Fatalf("RecordConsent: %v", err)
	}

	if got.ID == "" {
		t.Error("consent id missing")
	}
	if got.SubjectID == "" {
		t.Error("subject id missing")
	}
	if got.PolicyID != "europe_opt_in" {
		t.Errorf("policyId = %q, want europe_opt_in", got.PolicyID)
	}
	if got.ValidUntil == nil {
		t.Error("validUntil missing")
	}
	if got.GivenAt.IsZero() {
		t.Error("givenAt not parsed")
	}
	if got.Action != "accept_all" {
		t.Errorf("action = %q, want accept_all", got.Action)
	}
}

func TestRecordConsentGPC(t *testing.T) {
	client, _ := newServer(t)

	got, err := client.RecordConsent(context.Background(), sdk.ConsentRequest{
		ExternalID: "gpc-user",
		Domain:     "example.com",
		Categories: []string{"necessary", "marketing"},
		Action:     "accept_all",
	}, sdk.GeoHints{CountryCode: "US", RegionCode: "CA", GPCSignal: true})
	if err != nil {
		t.Fatalf("RecordConsent: %v", err)
	}

	if got.Action != "opt_out" {
		t.Errorf("action = %q, want opt_out when a GPC signal is sent", got.Action)
	}
}

func TestRecordConsentClientValidation(t *testing.T) {
	client, _ := newServer(t)

	tests := []struct {
		name string
		req  sdk.ConsentRequest
	}{
		{
			name: "missing domain",
			req:  sdk.ConsentRequest{ExternalID: "x", Categories: []string{"necessary"}},
		},
		{
			name: "missing subject and external id",
			req:  sdk.ConsentRequest{Domain: "example.com", Categories: []string{"necessary"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := client.RecordConsent(context.Background(), tt.req, sdk.GeoHints{})
			if err == nil {
				t.Error("expected a client-side rejection")
			}
		})
	}
}

func TestRecordConsentServerError(t *testing.T) {
	client, _ := newServer(t)

	_, err := client.RecordConsent(context.Background(), sdk.ConsentRequest{
		ExternalID: "x",
		Domain:     "example.com",
		Categories: []string{"necessary"},
		Action:     "shrug",
	}, sdk.GeoHints{CountryCode: "DE"})

	if err == nil {
		t.Fatal("expected an error for an unknown action")
	}

	apiErr, ok := err.(*sdk.APIError)
	if !ok {
		t.Fatalf("error type = %T, want *sdk.APIError", err)
	}
	if !apiErr.IsInvalidRequest() {
		t.Errorf("status = %d, want 400", apiErr.StatusCode)
	}
}

func TestUnauthorized(t *testing.T) {
	_, app := newServer(t)

	pbRouter, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("NewRouter: %v", err)
	}
	api.Register(app, &core.ServeEvent{App: app, Router: pbRouter}, api.DefaultConfig())

	mux, err := pbRouter.BuildMux()
	if err != nil {
		t.Fatalf("BuildMux: %v", err)
	}

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	client, err := sdk.New(srv.URL, "c15t_test_bogus")
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	_, err = client.Init(context.Background(), sdk.GeoHints{})
	if err == nil {
		t.Fatal("expected an unauthorized error")
	}

	apiErr, ok := err.(*sdk.APIError)
	if !ok {
		t.Fatalf("error type = %T, want *sdk.APIError", err)
	}
	if !apiErr.IsUnauthorized() {
		t.Errorf("status = %d, want 401", apiErr.StatusCode)
	}
}

func TestListConsent(t *testing.T) {
	client, _ := newServer(t)
	ctx := context.Background()

	written, err := client.RecordConsent(ctx, sdk.ConsentRequest{
		ExternalID: "user-1",
		Domain:     "example.com",
		Categories: []string{"necessary"},
	}, sdk.GeoHints{CountryCode: "DE"})
	if err != nil {
		t.Fatalf("RecordConsent: %v", err)
	}

	got, err := client.ListConsent(ctx, written.SubjectID)
	if err != nil {
		t.Fatalf("ListConsent: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("consents = %d, want 1", len(got))
	}
	if got[0].ID != written.ID {
		t.Errorf("consent id = %q, want %q", got[0].ID, written.ID)
	}
}

func TestListConsentRequiresSubject(t *testing.T) {
	client, _ := newServer(t)

	if _, err := client.ListConsent(context.Background(), ""); err == nil {
		t.Error("expected a client-side rejection for an empty subject id")
	}
}

func TestListConsentUnknownSubjectIsEmpty(t *testing.T) {
	client, _ := newServer(t)

	got, err := client.ListConsent(context.Background(), "doesnotexist00")
	if err != nil {
		t.Fatalf("ListConsent: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("consents = %d, want 0", len(got))
	}
}

func TestContextCancellation(t *testing.T) {
	client, _ := newServer(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := client.Init(ctx, sdk.GeoHints{}); err == nil {
		t.Error("expected a cancelled context to fail the request")
	}
}

func TestWithUserAgent(t *testing.T) {
	var seen string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jurisdiction":"NONE","location":{}}`))
	}))
	t.Cleanup(srv.Close)

	client, err := sdk.New(srv.URL, "key", sdk.WithUserAgent("my-app/2.0"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := client.Init(context.Background(), sdk.GeoHints{}); err != nil {
		t.Fatalf("Init: %v", err)
	}

	if seen != "my-app/2.0" {
		t.Errorf("user agent = %q, want my-app/2.0", seen)
	}
}

func TestGeoHintsAreSent(t *testing.T) {
	var got http.Header

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jurisdiction":"NONE","location":{}}`))
	}))
	t.Cleanup(srv.Close)

	client, err := sdk.New(srv.URL, "key")
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	_, err = client.Init(context.Background(), sdk.GeoHints{
		CountryCode: "DE",
		RegionCode:  "BY",
		GPCSignal:   true,
		ForwardedIP: "203.0.113.5",
	})
	if err != nil {
		t.Fatalf("Init: %v", err)
	}

	want := map[string]string{
		"X-C15t-Country":  "DE",
		"X-C15t-Region":   "BY",
		"Sec-Gpc":         "1",
		"X-Forwarded-For": "203.0.113.5",
		"Authorization":   "Bearer key",
	}

	for header, value := range want {
		if got.Get(header) != value {
			t.Errorf("%s = %q, want %q", header, got.Get(header), value)
		}
	}
}

func TestCheckConsent(t *testing.T) {
	client, _ := newServer(t)
	ctx := context.Background()

	got, err := client.CheckConsent(ctx, "nobody", []string{"cookie_banner"})
	if err != nil {
		t.Fatalf("CheckConsent: %v", err)
	}
	if got["cookie_banner"].HasConsent {
		t.Error("unknown identity reported as consented")
	}

	if _, err := client.RecordConsent(ctx, sdk.ConsentRequest{
		ExternalID: "user-1",
		Domain:     "example.com",
		Categories: []string{"necessary"},
	}, sdk.GeoHints{CountryCode: "DE"}); err != nil {
		t.Fatalf("RecordConsent: %v", err)
	}

	got, err = client.CheckConsent(ctx, "user-1", []string{"cookie_banner", "privacy_policy"})
	if err != nil {
		t.Fatalf("CheckConsent: %v", err)
	}

	if !got["cookie_banner"].HasConsent {
		t.Error("cookie_banner should report consent")
	}
	if !got["cookie_banner"].IsLatestPolicy {
		t.Error("cookie_banner should be the latest policy")
	}
	if got["privacy_policy"].HasConsent {
		t.Error("privacy_policy should not report consent")
	}
}

func TestCheckConsentValidation(t *testing.T) {
	client, _ := newServer(t)

	if _, err := client.CheckConsent(context.Background(), "", []string{"cookie_banner"}); err == nil {
		t.Error("expected a rejection for an empty externalId")
	}
	if _, err := client.CheckConsent(context.Background(), "x", nil); err == nil {
		t.Error("expected a rejection for no types")
	}
}

func TestRecordConsentIsIdempotent(t *testing.T) {
	client, _ := newServer(t)
	ctx := context.Background()

	givenAt := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	req := sdk.ConsentRequest{
		ExternalID: "user-1",
		Domain:     "example.com",
		Categories: []string{"necessary"},
		GivenAt:    &givenAt,
	}

	first, err := client.RecordConsent(ctx, req, sdk.GeoHints{CountryCode: "DE"})
	if err != nil {
		t.Fatalf("first RecordConsent: %v", err)
	}

	second, err := client.RecordConsent(ctx, req, sdk.GeoHints{CountryCode: "DE"})
	if err != nil {
		t.Fatalf("repeat RecordConsent: %v", err)
	}

	if first.ID != second.ID {
		t.Errorf("repeat returned a different consent: %q vs %q", first.ID, second.ID)
	}
	if !second.Duplicate {
		t.Error("repeat was not flagged as a duplicate")
	}
}

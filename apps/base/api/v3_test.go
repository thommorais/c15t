package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"thom/api"
	"thom/core/apikey"
	"thom/core/policyrule"
)

func jsonBody(t *testing.T, value any) string {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestV3InitContractAndQueryContext(t *testing.T) {
	cfg := api.DefaultConfig()
	cfg.SnapshotSecret = "test-only-signing-key"
	h := newHarness(t, cfg)
	key := h.key()
	r := h.do("GET", "/api/c15t/init?v=3&contract=1&country=us&region=us-ca&gpc=0", "", auth(key, "cf-ipcountry", "DE", "sec-gpc", "1"))
	if r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	body := decode(t, r)
	resolution := body["policyResolution"].(map[string]any)
	location := body["location"].(map[string]any)
	if resolution["status"] != "matched" || resolution["version"] != float64(1) || resolution["policyId"] != "us_privacy_states_opt_out" || location["countryCode"] != "US" || location["regionCode"] != "CA" {
		t.Fatal(r.Body.String())
	}
	if body["resolvedPrivacySignals"].(map[string]any)["gpc"] != false || r.Header().Get("x-c15t-policy-contract") != "1" {
		t.Fatal(r.Body.String(), r.Header())
	}
	if body["branding"] != "c15t" || body["hosting"] != "self-hosted" {
		t.Fatal(r.Body.String())
	}
	for _, query := range []string{"contract=2", "contract=abc"} {
		r := h.do("GET", "/api/c15t/init?"+query, "", auth(key))
		resolution := decode(t, r)["policyResolution"].(map[string]any)
		if resolution["status"] != "failed" || resolution["reason"] != "unsupported-contract" {
			t.Fatal(r.Body.String())
		}
		if decode(t, r)["policySnapshotToken"] != nil {
			t.Fatal("signed an unsupported contract")
		}
	}
}

func TestV3ResolutionOutcomes(t *testing.T) {
	for _, tc := range []struct {
		name    string
		rules   *[]policyrule.PolicyRule
		country string
		status  string
	}{
		{"unconfigured", nil, "DE", "unconfigured"},
		{"empty", &[]policyrule.PolicyRule{}, "DE", "no-match"},
		{"no match", &[]policyrule.PolicyRule{{ID: "de", Model: "opt-in", Prompt: "choice", Match: &policyrule.Match{Countries: []string{"DE"}}}}, "JP", "no-match"},
		{"insufficient inputs", &[]policyrule.PolicyRule{{ID: "de", Model: "opt-in", Prompt: "choice", Match: &policyrule.Match{Countries: []string{"DE"}}}}, "", "failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := api.DefaultConfig()
			cfg.PolicyRules = tc.rules
			cfg.SnapshotSecret = "test-signing-secret"
			h := newHarness(t, cfg)
			r := h.do("GET", "/api/c15t/init?country="+tc.country, "", auth(h.key()))
			wire := decode(t, r)["policyResolution"].(map[string]any)
			if wire["status"] != tc.status || wire["policy"] != nil {
				t.Fatal(r.Body.String())
			}
			if decode(t, r)["policySnapshotToken"] != nil {
				t.Fatal("signed a non-matched resolution")
			}
			write := h.do("POST", "/api/c15t/consent", `{"domain":"fallback.example","categories":["necessary"],"givenAt":"2026-11-01T12:00:00Z"}`, auth(h.key()))
			if write.Code != 201 {
				t.Fatal("write-time safe fallback failed", write.Body.String())
			}
		})
	}
}

func TestV3ReceiptsAndSubjectProofRoundTrip(t *testing.T) {
	rules := []policyrule.PolicyRule{{ID: "test", Model: "opt-in", Prompt: "choice", Match: &policyrule.Match{IsDefault: true}, ScopeMode: "strict", Categories: []string{"measurement", "marketing"}, PrivacySignals: &policyrule.PrivacySignals{GPC: &policyrule.GPC{DenyCategories: []string{"marketing"}}}}}
	cfg := api.DefaultConfig()
	cfg.PolicyRules = &rules
	cfg.SnapshotSecret = "test-only-key"
	cfg.SnapshotRequired = true
	h := newHarness(t, cfg)
	key := h.keyWithOrigins(apikey.ScopePublishable, "https://shop.example")
	headers := auth(key, "Origin", "https://shop.example", "Sec-GPC", "1")
	init := decode(t, h.do("GET", "/api/c15t/init?contract=1", "", headers))
	fp := init["policyResolution"].(map[string]any)["fingerprints"].(map[string]any)["choice"].(string)
	t0, t1 := time.Now().Add(-time.Minute).Truncate(time.Millisecond), time.Now().Add(-30*time.Second).Truncate(time.Millisecond)
	secret := strings.Repeat("a", 64)
	receipt := func(value bool, at time.Time) map[string]any {
		return map[string]any{"value": value, "confirmedAt": at.UnixMilli(), "basis": map[string]any{"kind": "choice-v1", "fingerprint": fp}}
	}
	payload := map[string]any{"clientSubjectId": "sub_test_roundtrip_12345", "subjectToken": secret, "domain": "shop.example", "givenAt": t0.Format(time.RFC3339Nano), "action": "accept_all", "policySnapshotToken": init["policySnapshotToken"], "choice": map[string]any{"version": 3, "categories": map[string]any{"marketing": receipt(true, t0), "measurement": receipt(true, t0)}}}
	// A valid snapshot still describes the policy shown before this edit.
	rules[0].CopyRevision = "updated"
	first := h.do("POST", "/api/c15t/consent", jsonBody(t, payload), headers)
	if first.Code != 201 {
		t.Fatal(first.Body.String())
	}
	id := decode(t, first)["subjectId"].(string)
	retry := h.do("POST", "/api/c15t/consent", jsonBody(t, payload), headers)
	if retry.Code != 200 || decode(t, retry)["id"] != decode(t, first)["id"] || h.count("subject") != 1 || h.count("consent") != 1 {
		t.Fatal(retry.Body.String())
	}
	payload["givenAt"] = t1.Format(time.RFC3339Nano)
	payload["action"] = "custom"
	payload["choice"] = map[string]any{"version": 3, "categories": map[string]any{"marketing": receipt(false, t1)}}
	second := h.do("POST", "/api/c15t/consent", jsonBody(t, payload), headers)
	if second.Code != 201 {
		t.Fatal(second.Body.String())
	}
	readHeaders := auth(key, "Origin", "https://shop.example", "X-C15T-Subject-Token", secret)
	read := h.do("GET", "/api/c15t/subjects/"+id+"/record", "", readHeaders)
	if read.Code != 200 || read.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(read.Body.String())
	}
	choice := decode(t, read)["subjectChoice"].(map[string]any)["categories"].(map[string]any)
	marketing, measurement := choice["marketing"].(map[string]any), choice["measurement"].(map[string]any)
	if marketing["value"] != false || marketing["confirmedAt"] != float64(t1.UnixMilli()) || measurement["value"] != true || measurement["confirmedAt"] != float64(t0.UnixMilli()) {
		t.Fatal(read.Body.String())
	}
	for _, token := range []string{"", strings.Repeat("b", 64)} {
		r := h.do("GET", "/api/c15t/subjects/"+id+"/record", "", auth(key, "Origin", "https://shop.example", "X-C15T-Subject-Token", token))
		if r.Code != http.StatusForbidden {
			t.Fatal(r.Code, r.Body.String())
		}
	}
	if r := h.do("GET", "/api/c15t/subjects/"+id, "", headers); r.Code != 403 {
		t.Fatal("publishable key read secret endpoint")
	}
	payload["subjectToken"] = strings.Repeat("b", 64)
	if r := h.do("POST", "/api/c15t/consent", jsonBody(t, payload), headers); r.Code != 403 {
		t.Fatal("wrong proof wrote to subject", r.Body.String())
	}
	patch := fmt.Sprintf(`{"externalId":"visitor-1","subjectToken":%q}`, secret)
	if r := h.do("PATCH", "/api/c15t/subjects/"+id, patch, headers); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	patch = fmt.Sprintf(`{"externalId":"visitor-2","subjectToken":%q}`, secret)
	if r := h.do("PATCH", "/api/c15t/subjects/"+id, patch, headers); r.Code != 403 {
		t.Fatal("publishable key relinked subject", r.Body.String())
	}
}

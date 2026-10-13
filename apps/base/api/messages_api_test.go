package api_test

import (
	"net/http"
	"testing"

	"thom/api"
	"thom/core/i18n"
	"thom/core/policy"
)

func profileStrings(acceptAll string) i18n.Translations {
	return i18n.Translations{"common": map[string]any{"acceptAll": acceptAll}}
}

func messagesConfig(packs ...policy.Config) api.Config {
	cfg := snapshotConfig(false)
	cfg.Messages = i18n.Messages{Profiles: map[string]i18n.Profile{
		"default": {Translations: map[string]i18n.Translations{
			"en":    profileStrings("Fine"),
			"pt-BR": profileStrings("Concordo"),
		}},
		"strict": {Translations: map[string]i18n.Translations{
			"de": profileStrings("Einverstanden"),
		}},
	}}
	if packs != nil {
		cfg.PolicyPacks = packs
	}
	return cfg
}

func shownOnInit(t *testing.T, h *harness, header string) (string, string) {
	t.Helper()

	rec := h.do(http.MethodGet, "/api/c15t/init", "", auth(h.key(), "cf-ipcountry", "DE", "Accept-Language", header))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	shown, _ := decode(t, rec)["translations"].(map[string]any)
	strings, _ := shown["translations"].(map[string]any)
	common, _ := strings["common"].(map[string]any)
	language, _ := shown["language"].(string)
	acceptAll, _ := common["acceptAll"].(string)
	return language, acceptAll
}

func TestInitServesTheDefaultProfile(t *testing.T) {
	h := newHarness(t, messagesConfig())

	if language, acceptAll := shownOnInit(t, h, "pt-BR"); language != "pt-BR" || acceptAll != "Concordo" {
		t.Errorf("got %q / %q, want the default profile's pt-BR", language, acceptAll)
	}
	if language, acceptAll := shownOnInit(t, h, "de"); language != "en" || acceptAll != "Fine" {
		t.Errorf("got %q / %q, want the profile's english: de is outside the profile", language, acceptAll)
	}
}

func TestInitServesThePolicyProfile(t *testing.T) {
	profile := "strict"
	h := newHarness(t, messagesConfig(policy.Config{
		ID:    "strict_de",
		Match: policy.MatchCountries([]string{"DE"}),
		I18n:  &policy.I18n{MessageProfile: &profile},
	}))

	if language, acceptAll := shownOnInit(t, h, "en"); language != "de" || acceptAll != "Einverstanden" {
		t.Errorf("got %q / %q, want the strict profile's only language", language, acceptAll)
	}
}

func TestConsentRecordsTheProfileLanguage(t *testing.T) {
	profile := "strict"
	model := policy.ModelOptIn
	h := newHarness(t, messagesConfig(policy.Config{
		ID:      "strict_de",
		Match:   policy.MatchCountries([]string{"DE"}),
		I18n:    &policy.I18n{MessageProfile: &profile},
		Consent: &policy.ConsentConfig{Model: &model},
	}))

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"x","domain":"example.com","categories":["necessary"]}`,
		auth(h.key(), "cf-ipcountry", "DE", "Accept-Language", "en"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}

	decision, err := h.app.FindFirstRecordByFilter("runtimePolicyDecision", "id != ''", nil)
	if err != nil {
		t.Fatalf("find decision: %v", err)
	}
	if got := decision.GetString("language"); got != "de" {
		t.Errorf("decision language = %q, want de, the language init would have shown", got)
	}
}

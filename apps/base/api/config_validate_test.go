package api

import (
	"strings"
	"testing"

	"thom/core/i18n"
	"thom/core/policy"
)

func TestValidateConfigRejectsAnInvalidPackAtStartup(t *testing.T) {
	cfg := DefaultConfig()
	cfg.PolicyPacks = []policy.Config{
		{ID: "a", Match: policy.MatchDefault()},
		{ID: "b", Match: policy.MatchDefault()},
	}

	_, err := ValidateConfig(cfg)
	if err == nil {
		t.Fatal("two default policies must stop startup, not fail every request")
	}
	if !strings.Contains(err.Error(), "policyPacks:") || !strings.Contains(err.Error(), "Only one default policy is allowed") {
		t.Errorf("error = %q, want it to name policyPacks and the problem", err)
	}
}

func TestValidateConfigReturnsWarningsForAValidPack(t *testing.T) {
	cfg := DefaultConfig()
	cfg.PolicyPacks = []policy.Config{{ID: "de", Match: policy.MatchCountries([]string{"DE"})}}

	warnings, err := ValidateConfig(cfg)
	if err != nil {
		t.Fatalf("a pack with only warnings must start: %v", err)
	}
	if len(warnings) == 0 {
		t.Fatal("want the missing default and fallback reported")
	}
	for _, w := range warnings {
		if !strings.HasPrefix(w, "policyPacks: ") {
			t.Errorf("warning %q is not labelled with its source", w)
		}
	}
}

func TestValidateConfigAcceptsTheDefaults(t *testing.T) {
	if warnings, err := ValidateConfig(DefaultConfig()); err != nil || len(warnings) != 0 {
		t.Errorf("DefaultConfig: warnings = %v, err = %v, want a clean start", warnings, err)
	}
}

func TestValidateConfigTreatsNoPacksAsValid(t *testing.T) {
	cfg := DefaultConfig()
	cfg.PolicyPacks = nil

	if warnings, err := ValidateConfig(cfg); err != nil || len(warnings) != 0 {
		t.Errorf("no packs: warnings = %v, err = %v", warnings, err)
	}
}

func TestValidateConfigRejectsAPolicyNamingAMissingProfile(t *testing.T) {
	profile := "strict"
	cfg := DefaultConfig()
	cfg.Messages = i18n.Messages{Profiles: map[string]i18n.Profile{
		"default": {Translations: map[string]i18n.Translations{"en": {}}},
	}}
	cfg.PolicyPacks = append(cfg.PolicyPacks, policy.Config{
		ID:    "strict_de",
		Match: policy.MatchCountries([]string{"DE"}),
		I18n:  &policy.I18n{MessageProfile: &profile},
	})

	_, err := ValidateConfig(cfg)
	if err == nil || !strings.HasPrefix(err.Error(), "i18n: ") || !strings.Contains(err.Error(), `"strict"`) {
		t.Fatalf("err = %v, want an i18n error naming the profile", err)
	}
}

func TestValidateConfigWarnsAboutAMissingDefaultProfile(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Messages = i18n.Messages{DefaultProfile: "main", Profiles: map[string]i18n.Profile{
		"strict": {Translations: map[string]i18n.Translations{"de": {}}},
	}}

	warnings, err := ValidateConfig(cfg)
	if err != nil {
		t.Fatalf("a missing default profile must still start: %v", err)
	}
	if len(warnings) != 1 || !strings.HasPrefix(warnings[0], "i18n: ") {
		t.Fatalf("warnings = %v, want one labelled i18n", warnings)
	}
}

package policy

import (
	"strings"
	"testing"
)

func TestInspectErrors(t *testing.T) {
	tests := []struct {
		name     string
		policies []Config
		iab      bool
		wantErr  string
	}{
		{
			name: "multiple defaults",
			policies: []Config{
				{ID: "a", Match: MatchDefault()},
				{ID: "b", Match: MatchDefault()},
			},
			wantErr: "Only one default policy is allowed",
		},
		{
			name: "multiple fallbacks",
			policies: []Config{
				{ID: "a", Match: MatchFallback()},
				{ID: "b", Match: MatchFallback()},
			},
			wantErr: "Only one fallback policy is allowed",
		},
		{
			name: "iab without iab enabled",
			policies: []Config{{
				ID:      "a",
				Match:   MatchCountries([]string{"DE"}),
				Consent: &ConsentConfig{Model: ptr(ModelIAB)},
			}},
			iab:     false,
			wantErr: `require top-level iab.enabled=true`,
		},
		{
			name: "iab with ui overrides",
			policies: []Config{{
				ID:      "a",
				Match:   MatchCountries([]string{"DE"}),
				Consent: &ConsentConfig{Model: ptr(ModelIAB)},
				UI:      &UIConfig{Mode: ptr(UIModeBanner)},
			}},
			iab:     true,
			wantErr: "cannot define ui.* overrides",
		},
		{
			name: "iab with preselected categories",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				Consent: &ConsentConfig{
					Model:                 ptr(ModelIAB),
					PreselectedCategories: []string{"marketing"},
				},
			}},
			iab:     true,
			wantErr: "cannot define consent.preselectedCategories",
		},
		{
			name: "primary action not allowed",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				UI: &UIConfig{Banner: &UISurfaceConfig{
					AllowedActions: []UIAction{ActionAccept},
					PrimaryActions: []UIAction{ActionReject},
				}},
			}},
			wantErr: "is not in allowedActions",
		},
		{
			name: "dialog primary action not allowed",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				UI: &UIConfig{Dialog: &UISurfaceConfig{
					AllowedActions: []UIAction{ActionAccept},
					PrimaryActions: []UIAction{ActionReject},
				}},
			}},
			wantErr: "ui.dialog.primaryActions",
		},
		{
			name: "layout action not allowed",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				UI: &UIConfig{Banner: &UISurfaceConfig{
					AllowedActions: []UIAction{ActionAccept},
					Layout:         [][]UIAction{{ActionAccept}, {ActionReject}},
				}},
			}},
			wantErr: "which is not in allowedActions",
		},
		{
			name: "layout duplicate action",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				UI: &UIConfig{Banner: &UISurfaceConfig{
					AllowedActions: []UIAction{ActionAccept, ActionReject},
					Layout:         [][]UIAction{{ActionAccept, ActionAccept}, {ActionReject}},
				}},
			}},
			wantErr: "duplicate action",
		},
		{
			name: "layout empty group",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				UI: &UIConfig{Banner: &UISurfaceConfig{
					AllowedActions: []UIAction{ActionAccept},
					Layout:         [][]UIAction{{}},
				}},
			}},
			wantErr: "empty action group",
		},
		{
			name: "layout missing allowed action",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				UI: &UIConfig{Banner: &UISurfaceConfig{
					AllowedActions: []UIAction{ActionAccept, ActionReject},
					Layout:         [][]UIAction{{ActionAccept}},
				}},
			}},
			wantErr: "must include every allowed action",
		},
		{
			name:     "empty id",
			policies: []Config{{ID: "", Match: MatchDefault()}},
			wantErr:  "missing a non-empty id",
		},
		{
			name:     "whitespace id",
			policies: []Config{{ID: "   ", Match: MatchDefault()}},
			wantErr:  "missing a non-empty id",
		},
		{
			name: "duplicate ids",
			policies: []Config{
				{ID: "dup", Match: MatchCountries([]string{"DE"})},
				{ID: "dup", Match: MatchCountries([]string{"FR"})},
			},
			wantErr: "must be unique",
		},
		{
			name:     "no matcher",
			policies: []Config{{ID: "a"}},
			wantErr:  "has no matcher",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Inspect(tt.policies, tt.iab)
			if !containsSubstring(got.Errors, tt.wantErr) {
				t.Errorf("errors = %v, want one containing %q", got.Errors, tt.wantErr)
			}
		})
	}
}

func TestInspectAccepts(t *testing.T) {
	tests := []struct {
		name     string
		policies []Config
		iab      bool
	}{
		{
			name: "primary action within allowed",
			policies: []Config{{
				ID:    "a",
				Match: MatchCountries([]string{"DE"}),
				UI: &UIConfig{Banner: &UISurfaceConfig{
					AllowedActions: []UIAction{ActionAccept, ActionReject},
					PrimaryActions: []UIAction{ActionAccept},
					Layout:         [][]UIAction{{ActionAccept, ActionReject}},
				}},
			}},
		},
		{
			name:     "fallback only matcher is valid",
			policies: []Config{{ID: "a", Match: MatchFallback()}},
		},
		{
			name: "iab with iab enabled",
			policies: []Config{{
				ID:      "a",
				Match:   MatchCountries([]string{"DE"}),
				Consent: &ConsentConfig{Model: ptr(ModelIAB)},
			}},
			iab: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Inspect(tt.policies, tt.iab); len(got.Errors) != 0 {
				t.Errorf("unexpected errors: %v", got.Errors)
			}
		})
	}
}

func TestInspectWarnings(t *testing.T) {
	tests := []struct {
		name     string
		policies []Config
		wantWarn string
	}{
		{
			name:     "no default configured",
			policies: []Config{{ID: "a", Match: MatchCountries([]string{"DE"})}},
			wantWarn: "No default policy configured",
		},
		{
			name:     "no fallback configured",
			policies: []Config{{ID: "a", Match: MatchCountries([]string{"DE"})}},
			wantWarn: "No fallback policy configured",
		},
		{
			name: "overlapping country matchers",
			policies: []Config{
				{ID: "a", Match: MatchCountries([]string{"DE"})},
				{ID: "b", Match: MatchCountries([]string{"DE"})},
			},
			wantWarn: "appears in multiple policies",
		},
		{
			name: "overlapping region matchers",
			policies: []Config{
				{ID: "a", Match: MatchRegions([]Region{{Country: "US", Region: "CA"}})},
				{ID: "b", Match: MatchRegions([]Region{{Country: "US", Region: "CA"}})},
			},
			wantWarn: "appears in multiple policies",
		},
		{
			name: "default with explicit matchers",
			policies: []Config{{
				ID: "a",
				Match: MatchMerge(
					MatchDefault(),
					MatchCountries([]string{"DE"}),
				),
			}},
			wantWarn: "also defines explicit matchers",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Inspect(tt.policies, false)
			if !containsSubstring(got.Warnings, tt.wantWarn) {
				t.Errorf("warnings = %v, want one containing %q", got.Warnings, tt.wantWarn)
			}
		})
	}
}

func TestInspectNoFallbackWarningWhenPresent(t *testing.T) {
	got := Inspect([]Config{
		{ID: "a", Match: MatchFallback()},
		{ID: "b", Match: MatchDefault()},
	}, false)

	if containsSubstring(got.Warnings, "No fallback policy configured") {
		t.Errorf("unexpected fallback warning: %v", got.Warnings)
	}
	if containsSubstring(got.Warnings, "No default policy configured") {
		t.Errorf("unexpected default warning: %v", got.Warnings)
	}
}

func TestMatchersMerge(t *testing.T) {
	got := MatchMerge(
		MatchCountries([]string{"de", "DE", "fr"}),
		MatchRegions([]Region{{Country: "us", Region: "ca"}, {Country: "US", Region: "CA"}}),
		MatchFallback(),
		MatchDefault(),
	)

	if !equalStrings(got.Countries, []string{"DE", "FR"}) {
		t.Errorf("countries = %v, want [DE FR] deduplicated and uppercased", got.Countries)
	}
	if len(got.Regions) != 1 {
		t.Errorf("regions = %v, want one deduplicated entry", got.Regions)
	} else if got.Regions[0] != (Region{Country: "US", Region: "CA"}) {
		t.Errorf("region = %+v, want US/CA uppercased", got.Regions[0])
	}
	if !got.Fallback {
		t.Error("fallback flag not propagated")
	}
	if !got.IsDefault {
		t.Error("isDefault flag not propagated")
	}
}

func containsSubstring(haystack []string, needle string) bool {
	for _, s := range haystack {
		if strings.Contains(s, needle) {
			return true
		}
	}
	return false
}

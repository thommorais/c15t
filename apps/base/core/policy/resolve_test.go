package policy

import "testing"

var (
	euPolicy = Config{
		ID:      "eu",
		Match:   MatchCountries([]string{"DE", "FR"}),
		Consent: &ConsentConfig{Model: ptr(ModelOptIn)},
	}
	fallbackPolicy = Config{
		ID:      "strict_fallback",
		Match:   MatchFallback(),
		Consent: &ConsentConfig{Model: ptr(ModelOptIn)},
	}
	defaultPolicy = Config{
		ID:      "world_default",
		Match:   MatchDefault(),
		Consent: &ConsentConfig{Model: ptr(ModelNone)},
	}
)

func TestResolvePrecedence(t *testing.T) {
	tests := []struct {
		name          string
		policies      []Config
		country       *string
		region        *string
		wantID        string
		wantMatchedBy MatchedBy
	}{
		{
			name:          "fallback when country unknown",
			policies:      []Config{euPolicy, fallbackPolicy, defaultPolicy},
			country:       nil,
			wantID:        "strict_fallback",
			wantMatchedBy: MatchedByFallback,
		},
		{
			name:          "default when country known but unmatched",
			policies:      []Config{euPolicy, fallbackPolicy, defaultPolicy},
			country:       ptr("US"),
			wantID:        "world_default",
			wantMatchedBy: MatchedByDefault,
		},
		{
			name:          "country match beats fallback",
			policies:      []Config{euPolicy, fallbackPolicy, defaultPolicy},
			country:       ptr("DE"),
			wantID:        "eu",
			wantMatchedBy: MatchedByCountry,
		},
		{
			name:          "default when no fallback and country unknown",
			policies:      []Config{euPolicy, defaultPolicy},
			country:       nil,
			wantID:        "world_default",
			wantMatchedBy: MatchedByDefault,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Resolve(Request{
				Policies:    tt.policies,
				CountryCode: tt.country,
				RegionCode:  tt.region,
			})
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if got == nil {
				t.Fatal("expected a decision, got nil")
			}
			if got.Policy.ID != tt.wantID {
				t.Errorf("policy id = %q, want %q", got.Policy.ID, tt.wantID)
			}
			if got.MatchedBy != tt.wantMatchedBy {
				t.Errorf("matchedBy = %q, want %q", got.MatchedBy, tt.wantMatchedBy)
			}
		})
	}
}

func TestResolveRegionBeatsCountry(t *testing.T) {
	policies := []Config{
		{
			ID:      "us_ca",
			Match:   MatchRegions([]Region{{Country: "US", Region: "CA"}}),
			Consent: &ConsentConfig{Model: ptr(ModelOptOut)},
		},
		{
			ID:      "us",
			Match:   MatchCountries([]string{"US"}),
			Consent: &ConsentConfig{Model: ptr(ModelOptIn)},
		},
	}

	got, err := Resolve(Request{
		Policies:    policies,
		CountryCode: ptr("US"),
		RegionCode:  ptr("CA"),
	})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got == nil {
		t.Fatal("expected a decision")
	}
	if got.Policy.ID != "us_ca" || got.MatchedBy != MatchedByRegion {
		t.Errorf("got %q via %q, want us_ca via region", got.Policy.ID, got.MatchedBy)
	}
}

func TestResolveNormalisesCodes(t *testing.T) {
	tests := []struct {
		name    string
		country string
		region  *string
		match   Match
		wantID  string
	}{
		{
			name:    "country lowercase request",
			country: "gb",
			match:   MatchCountries([]string{"GB"}),
			wantID:  "p",
		},
		{
			name:    "country lowercase config",
			country: "GB",
			match:   MatchCountries([]string{"gb"}),
			wantID:  "p",
		},
		{
			name:    "region lowercase",
			country: "us",
			region:  ptr("ca"),
			match:   MatchRegions([]Region{{Country: "US", Region: "CA"}}),
			wantID:  "p",
		},
		{
			name:    "region with country prefix takes last segment",
			country: "US",
			region:  ptr("US-CA"),
			match:   MatchRegions([]Region{{Country: "US", Region: "CA"}}),
			wantID:  "p",
		},
		{
			name:    "quebec prefixed region",
			country: "CA",
			region:  ptr("CA-QC"),
			match:   MatchRegions([]Region{{Country: "CA", Region: "QC"}}),
			wantID:  "p",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Resolve(Request{
				Policies:    []Config{{ID: "p", Match: tt.match}},
				CountryCode: ptr(tt.country),
				RegionCode:  tt.region,
			})
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if got == nil || got.Policy.ID != tt.wantID {
				t.Fatalf("expected %q to match, got %+v", tt.wantID, got)
			}
		})
	}
}

func TestResolveFirstMatchWins(t *testing.T) {
	policies := []Config{
		{ID: "first", Match: MatchCountries([]string{"DE"})},
		{ID: "second", Match: MatchCountries([]string{"DE"})},
	}

	got, err := Resolve(Request{Policies: policies, CountryCode: ptr("DE")})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got == nil || got.Policy.ID != "first" {
		t.Fatalf("expected first policy to win, got %+v", got)
	}
}

func TestResolveReturnsNil(t *testing.T) {
	tests := []struct {
		name     string
		policies []Config
	}{
		{name: "nil pack", policies: nil},
		{name: "empty pack", policies: []Config{}},
		{
			name:     "no match and no default",
			policies: []Config{{ID: "eu", Match: MatchCountries([]string{"DE"})}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Resolve(Request{Policies: tt.policies, CountryCode: ptr("US")})
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if got != nil {
				t.Errorf("expected nil decision, got %+v", got)
			}
		})
	}
}

func TestResolveRejectsInvalidPack(t *testing.T) {
	policies := []Config{
		{ID: "a", Match: MatchDefault()},
		{ID: "b", Match: MatchDefault()},
	}

	got, err := Resolve(Request{Policies: policies, CountryCode: ptr("US")})
	if err == nil {
		t.Error("expected an error for a pack with two defaults")
	}
	if got != nil {
		t.Errorf("expected nil decision, got %+v", got)
	}
}

func TestResolveDefaults(t *testing.T) {
	got, err := Resolve(Request{
		Policies:    []Config{{ID: "p", Match: MatchDefault()}},
		CountryCode: ptr("US"),
	})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got == nil {
		t.Fatal("expected a decision")
	}
	if got.Policy.Model != ModelOptIn {
		t.Errorf("model = %q, want opt-in by default", got.Policy.Model)
	}
	if got.Policy.Consent.ScopeMode != ScopePermissive {
		t.Errorf("scopeMode = %q, want permissive by default", got.Policy.Consent.ScopeMode)
	}
}

func TestResolvePreselectedCategories(t *testing.T) {
	tests := []struct {
		name      string
		scopeMode ScopeMode
		cats      []string
		pre       []string
		want      []string
	}{
		{
			name:      "strict filters to allowlist",
			scopeMode: ScopeStrict,
			cats:      []string{"necessary", "functionality"},
			pre:       []string{"functionality", "marketing"},
			want:      []string{"functionality"},
		},
		{
			name:      "permissive passes through",
			scopeMode: ScopePermissive,
			cats:      []string{"necessary"},
			pre:       []string{"marketing"},
			want:      []string{"marketing"},
		},
		{
			name:      "strict with wildcard passes through",
			scopeMode: ScopeStrict,
			cats:      []string{CategoryWildcard},
			pre:       []string{"marketing"},
			want:      []string{"marketing"},
		},
		{
			name:      "strict with no categories passes through",
			scopeMode: ScopeStrict,
			cats:      nil,
			pre:       []string{"marketing"},
			want:      []string{"marketing"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Resolve(Request{
				Policies: []Config{{
					ID:    "p",
					Match: MatchCountries([]string{"GB"}),
					Consent: &ConsentConfig{
						Model:                 ptr(ModelOptIn),
						ScopeMode:             ptr(tt.scopeMode),
						Categories:            tt.cats,
						PreselectedCategories: tt.pre,
					},
				}},
				CountryCode: ptr("GB"),
			})
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if got == nil {
				t.Fatal("expected a decision")
			}
			if !equalStrings(got.Policy.Consent.PreselectedCategories, tt.want) {
				t.Errorf("preselected = %v, want %v", got.Policy.Consent.PreselectedCategories, tt.want)
			}
		})
	}
}

func TestResolveIABModel(t *testing.T) {
	got, err := Resolve(Request{
		Policies: []Config{{
			ID:    "iab",
			Match: MatchCountries([]string{"DE"}),
			Consent: &ConsentConfig{
				Model:      ptr(ModelIAB),
				Categories: []string{"necessary"},
			},
		}},
		CountryCode: ptr("DE"),
		IABEnabled:  true,
	})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got == nil {
		t.Fatal("expected a decision")
	}
	if !equalStrings(got.Policy.Consent.Categories, []string{CategoryWildcard}) {
		t.Errorf("categories = %v, want wildcard", got.Policy.Consent.Categories)
	}
	if got.Policy.UI != nil {
		t.Errorf("expected UI to be dropped for IAB, got %+v", got.Policy.UI)
	}
}

func TestResolveGPC(t *testing.T) {
	tests := []struct {
		name string
		gpc  *bool
		want *bool
	}{
		{name: "unset stays nil", gpc: nil, want: nil},
		{name: "false is preserved", gpc: ptr(false), want: ptr(false)},
		{name: "true is preserved", gpc: ptr(true), want: ptr(true)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Resolve(Request{
				Policies: []Config{{
					ID:      "p",
					Match:   MatchCountries([]string{"US"}),
					Consent: &ConsentConfig{Model: ptr(ModelOptOut), GPC: tt.gpc},
				}},
				CountryCode: ptr("US"),
			})
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if got == nil {
				t.Fatal("expected a decision")
			}

			switch {
			case tt.want == nil && got.Policy.Consent.GPC != nil:
				t.Errorf("gpc = %v, want nil", *got.Policy.Consent.GPC)
			case tt.want != nil && got.Policy.Consent.GPC == nil:
				t.Errorf("gpc = nil, want %v", *tt.want)
			case tt.want != nil && *got.Policy.Consent.GPC != *tt.want:
				t.Errorf("gpc = %v, want %v", *got.Policy.Consent.GPC, *tt.want)
			}
		})
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

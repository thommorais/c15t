package policy

import "testing"

func standardPack() []Config {
	return []Config{
		PresetEurope(ModelOptIn),
		PresetCalifornia(ModelOptOut),
		PresetWorldNoBanner(),
	}
}

func TestPresetPackIsValid(t *testing.T) {
	packs := map[string][]Config{
		"standard": standardPack(),
		"with quebec": {
			PresetEurope(ModelOptIn),
			PresetQuebec(),
			PresetCalifornia(ModelOptOut),
			PresetWorldNoBanner(),
		},
		"iab": {
			PresetEurope(ModelIAB),
			PresetWorldNoBanner(),
		},
	}

	for name, pack := range packs {
		t.Run(name, func(t *testing.T) {
			iab := name == "iab"
			if got := Inspect(pack, iab); len(got.Errors) != 0 {
				t.Errorf("unexpected errors: %v", got.Errors)
			}
		})
	}
}

func TestPresetResolution(t *testing.T) {
	tests := []struct {
		name          string
		country       *string
		region        *string
		wantID        string
		wantModel     Model
		wantMatchedBy MatchedBy
	}{
		{
			name:          "germany gets europe by country",
			country:       ptr("DE"),
			wantID:        "europe_opt_in",
			wantModel:     ModelOptIn,
			wantMatchedBy: MatchedByCountry,
		},
		{
			name:          "uk gets europe by country",
			country:       ptr("GB"),
			wantID:        "europe_opt_in",
			wantModel:     ModelOptIn,
			wantMatchedBy: MatchedByCountry,
		},
		{
			name:          "california gets opt-out by region",
			country:       ptr("US"),
			region:        ptr("CA"),
			wantID:        "california_opt_out",
			wantModel:     ModelOptOut,
			wantMatchedBy: MatchedByRegion,
		},
		{
			name:          "other us states get world default",
			country:       ptr("US"),
			region:        ptr("NY"),
			wantID:        "world_no_banner",
			wantModel:     ModelNone,
			wantMatchedBy: MatchedByDefault,
		},
		{
			name:          "unknown geo falls back to europe",
			country:       nil,
			wantID:        "europe_opt_in",
			wantModel:     ModelOptIn,
			wantMatchedBy: MatchedByFallback,
		},
		{
			name:          "brazil gets world default",
			country:       ptr("BR"),
			wantID:        "world_no_banner",
			wantModel:     ModelNone,
			wantMatchedBy: MatchedByDefault,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Resolve(Request{
				Policies:    standardPack(),
				CountryCode: tt.country,
				RegionCode:  tt.region,
			})
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if got == nil {
				t.Fatal("expected a decision")
			}
			if got.Policy.ID != tt.wantID {
				t.Errorf("policy id = %q, want %q", got.Policy.ID, tt.wantID)
			}
			if got.Policy.Model != tt.wantModel {
				t.Errorf("model = %q, want %q", got.Policy.Model, tt.wantModel)
			}
			if got.MatchedBy != tt.wantMatchedBy {
				t.Errorf("matchedBy = %q, want %q", got.MatchedBy, tt.wantMatchedBy)
			}
		})
	}
}

func TestPresetCaliforniaEnablesGPC(t *testing.T) {
	got, err := Resolve(Request{
		Policies:    standardPack(),
		CountryCode: ptr("US"),
		RegionCode:  ptr("CA"),
	})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got == nil {
		t.Fatal("expected a decision")
	}
	if got.Policy.Consent.GPC == nil || !*got.Policy.Consent.GPC {
		t.Error("expected GPC enabled for the california preset")
	}
}

func TestPresetEuropeIABDropsUI(t *testing.T) {
	got, err := Resolve(Request{
		Policies:    []Config{PresetEurope(ModelIAB), PresetWorldNoBanner()},
		CountryCode: ptr("DE"),
		IABEnabled:  true,
	})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got == nil {
		t.Fatal("expected a decision")
	}
	if got.Policy.UI != nil {
		t.Errorf("expected no UI for IAB, got %+v", got.Policy.UI)
	}
	if !equalStrings(got.Policy.Consent.Categories, []string{CategoryWildcard}) {
		t.Errorf("categories = %v, want wildcard", got.Policy.Consent.Categories)
	}
}

func TestComposePacksKeepsFirstDuplicate(t *testing.T) {
	got := ComposePacks(
		[]Config{{ID: "a", Match: MatchCountries([]string{"DE"})}},
		[]Config{{ID: "a", Match: MatchCountries([]string{"FR"})}},
		[]Config{{ID: "b", Match: MatchDefault()}},
	)

	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if !equalStrings(got[0].Match.Countries, []string{"DE"}) {
		t.Errorf("first duplicate not kept: %v", got[0].Match.Countries)
	}
}

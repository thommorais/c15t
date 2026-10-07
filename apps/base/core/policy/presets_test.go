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

func resolveBrazil(t *testing.T, preset Config) *Decision {
	t.Helper()

	got, err := Resolve(Request{
		Policies:    []Config{PresetEurope(ModelOptIn), preset, PresetWorldNoBanner()},
		CountryCode: ptr("BR"),
	})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got == nil {
		t.Fatal("expected a decision for BR")
	}
	return got
}

func TestBrazilPresetsAreValidAlongsideTheDefaults(t *testing.T) {
	for name, preset := range map[string]Config{"opt-in": PresetBrazilOptIn(), "opt-out": PresetBrazilOptOut()} {
		t.Run(name, func(t *testing.T) {
			pack := []Config{PresetEurope(ModelOptIn), PresetCalifornia(ModelOptOut), PresetQuebec(), preset, PresetWorldNoBanner()}
			if got := Inspect(pack, false); len(got.Errors) != 0 || len(got.Warnings) != 0 {
				t.Errorf("errors = %v, warnings = %v, want a clean pack", got.Errors, got.Warnings)
			}
		})
	}
}

func TestBrazilOptInPreset(t *testing.T) {
	got := resolveBrazil(t, PresetBrazilOptIn())

	if got.Policy.ID != "brazil_opt_in" || got.Policy.Model != ModelOptIn || got.MatchedBy != MatchedByCountry {
		t.Errorf("policy = %s, model = %s, matched by %s", got.Policy.ID, got.Policy.Model, got.MatchedBy)
	}

	consent := got.Policy.Consent
	if consent == nil || consent.ScopeMode != ScopeStrict {
		t.Fatalf("consent = %+v, want strict scope", consent)
	}
	if !equalStrings(consent.Categories, []string{"necessary", "functionality", "measurement", "marketing"}) {
		t.Errorf("categories = %v", consent.Categories)
	}
	if len(consent.PreselectedCategories) != 0 {
		t.Errorf("preselected = %v, want none: the regulator advises against pre-selected options", consent.PreselectedCategories)
	}
	if consent.ExpiryDays != nil {
		t.Errorf("expiryDays = %d, want none: the law sets no period, consent holds until withdrawn or the notice changes", *consent.ExpiryDays)
	}
	if consent.GPC != nil && *consent.GPC {
		t.Error("gpc must stay off: no Brazilian source recognises it")
	}

	banner := got.Policy.UI.Banner
	if got.Policy.UI.Mode == nil || *got.Policy.UI.Mode != UIModeBanner || banner == nil {
		t.Fatalf("ui = %+v, want a banner", got.Policy.UI)
	}
	if !containsAction(banner.AllowedActions, ActionReject) || !containsAction(banner.AllowedActions, ActionAccept) || !containsAction(banner.AllowedActions, ActionCustomize) {
		t.Errorf("allowed actions = %v, want accept, reject and customize", banner.AllowedActions)
	}
	if len(banner.Layout) == 0 || !containsAction(banner.Layout[0], ActionReject) || !containsAction(banner.Layout[0], ActionAccept) {
		t.Errorf("layout = %v, want reject beside accept on the first row", banner.Layout)
	}

	proof := got.Policy.Proof
	if proof == nil || !proof.StoresIP() || !proof.StoresUserAgent() || !proof.StoresLanguage() {
		t.Errorf("proof = %+v, want ip, user agent and language stored", proof)
	}
}

func TestBrazilOptOutPreset(t *testing.T) {
	got := resolveBrazil(t, PresetBrazilOptOut())

	if got.Policy.ID != "brazil_opt_out" || got.Policy.Model != ModelOptOut {
		t.Errorf("policy = %s, model = %s", got.Policy.ID, got.Policy.Model)
	}

	consent := got.Policy.Consent
	if consent == nil || consent.ScopeMode != ScopeStrict || !equalStrings(consent.Categories, []string{"necessary", "measurement"}) {
		t.Errorf("consent = %+v, want strict scope limited to necessary and measurement", consent)
	}
	if consent.ExpiryDays != nil {
		t.Errorf("expiryDays = %d, want none", *consent.ExpiryDays)
	}

	banner := got.Policy.UI.Banner
	if banner == nil || !containsAction(banner.AllowedActions, ActionReject) {
		t.Errorf("banner = %+v, want a way to refuse: the opposition option is a condition of relying on legitimate interest", banner)
	}
}

func TestBrazilPresetFingerprintsArePinned(t *testing.T) {
	tests := map[string]struct {
		preset Config
		want   string
	}{
		"opt-in":  {PresetBrazilOptIn(), "a0d9530c960ca7c779c88bb63f59d969331b865e0513c7b9dc917f77285e5767"},
		"opt-out": {PresetBrazilOptOut(), "3353e78737e115f6564d494ea13fe1a3ae7f14a2f465ce3a2e0c5f6059864d4f"},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			got := resolveBrazil(t, tt.preset).Fingerprint
			if got != tt.want {
				t.Errorf("fingerprint = %s, want the pinned %q: changing a preset changes what visitors are shown and what stored consents point at", got, tt.want)
			}
		})
	}
}

func containsAction(actions []UIAction, want UIAction) bool {
	for _, a := range actions {
		if a == want {
			return true
		}
	}
	return false
}

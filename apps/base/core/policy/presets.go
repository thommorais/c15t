package policy

func splitRowSurface() *UISurfaceConfig {
	return &UISurfaceConfig{
		AllowedActions: []UIAction{ActionAccept, ActionReject, ActionCustomize},
		Layout:         [][]UIAction{{ActionReject, ActionAccept}, {ActionCustomize}},
		Direction:      ptrOf(DirectionRow),
		PrimaryActions: []UIAction{ActionCustomize},
		UIProfile:      ptrOf(ProfileCompact),
	}
}

func fullProof() *ProofConfig {
	return &ProofConfig{
		StoreIP:        ptrOf(true),
		StoreUserAgent: ptrOf(true),
		StoreLanguage:  ptrOf(true),
	}
}

// PresetEurope matches the EEA plus the UK and doubles as the fallback policy
// for requests with unknown geo.
func PresetEurope(model Model) Config {
	c := Config{
		ID:    "europe_opt_in",
		Match: MatchMerge(MatchIAB(), MatchFallback()),
		Consent: &ConsentConfig{
			Model:      ptrOf(model),
			ExpiryDays: ptrOf(365),
		},
		Proof: fullProof(),
	}

	if model == ModelIAB {
		c.ID = "europe_iab"
		c.Consent.Categories = []string{CategoryWildcard}
		return c
	}

	c.UI = &UIConfig{
		Mode:   ptrOf(UIModeBanner),
		Banner: splitRowSurface(),
		Dialog: splitRowSurface(),
	}

	return c
}

func PresetCalifornia(model Model) Config {
	c := Config{
		ID:    "california_opt_in",
		Match: MatchRegions([]Region{{Country: "US", Region: "CA"}}),
		Consent: &ConsentConfig{
			Model:      ptrOf(model),
			ExpiryDays: ptrOf(365),
			GPC:        ptrOf(true),
		},
		Proof: fullProof(),
	}

	if model == ModelOptOut {
		c.ID = "california_opt_out"
		c.UI = &UIConfig{Mode: ptrOf(UIModeNone)}
		return c
	}

	c.UI = &UIConfig{
		Mode:   ptrOf(UIModeBanner),
		Banner: splitRowSurface(),
		Dialog: splitRowSurface(),
	}

	return c
}

func PresetQuebec() Config {
	return Config{
		ID:    "quebec_opt_in",
		Match: MatchRegions([]Region{{Country: "CA", Region: "QC"}}),
		Consent: &ConsentConfig{
			Model:      ptrOf(ModelOptIn),
			ExpiryDays: ptrOf(365),
		},
		UI: &UIConfig{
			Mode:   ptrOf(UIModeBanner),
			Banner: splitRowSurface(),
			Dialog: splitRowSurface(),
		},
		Proof: fullProof(),
	}
}

func PresetWorldNoBanner() Config {
	return Config{
		ID:      "world_no_banner",
		Match:   MatchDefault(),
		Consent: &ConsentConfig{Model: ptrOf(ModelNone)},
		UI:      &UIConfig{Mode: ptrOf(UIModeNone)},
		Proof: &ProofConfig{
			StoreIP:        ptrOf(false),
			StoreUserAgent: ptrOf(true),
			StoreLanguage:  ptrOf(false),
		},
	}
}

// ComposePacks concatenates packs, keeping the first policy for a duplicate id.
func ComposePacks(packs ...[]Config) []Config {
	seen := make(map[string]struct{})
	var out []Config

	for _, pack := range packs {
		for _, p := range pack {
			if _, dup := seen[p.ID]; dup {
				continue
			}
			seen[p.ID] = struct{}{}
			out = append(out, p)
		}
	}

	return out
}

func ptrOf[T any](v T) *T { return &v }

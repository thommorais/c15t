package policy

import "slices"

type Request struct {
	Policies    []Config
	CountryCode *string
	RegionCode  *string
	IABEnabled  bool
}

type compiled struct {
	regions   map[string]*Config
	countries map[string]*Config
	def       *Config
	fallback  *Config
}

// Resolve selects the policy for a request and returns nil when the pack is
// empty or nothing matches. An invalid pack is an error rather than a match.
func Resolve(req Request) (*Decision, error) {
	if len(req.Policies) == 0 {
		return nil, nil
	}

	if err := Validate(req.Policies, req.IABEnabled); err != nil {
		return nil, err
	}

	var country, region string
	if req.CountryCode != nil {
		country = normalizeCountry(*req.CountryCode)
	}
	if req.RegionCode != nil {
		region = normalizeRegionCode(*req.RegionCode)
	}

	match, matchedBy := compile(req.Policies).selectPolicy(country, region)
	if match == nil {
		return nil, nil
	}

	resolved := mapPolicy(*match)
	fingerprint, err := Fingerprint(resolved)
	if err != nil {
		return nil, err
	}

	return &Decision{
		Policy:      resolved,
		MatchedBy:   matchedBy,
		Fingerprint: fingerprint,
	}, nil
}

func compile(policies []Config) *compiled {
	c := &compiled{
		regions:   make(map[string]*Config),
		countries: make(map[string]*Config),
	}

	for i := range policies {
		p := &policies[i]

		for _, r := range p.Match.Regions {
			nr := normalizeRegion(r)
			key := regionKey(nr.Country, nr.Region)
			if _, exists := c.regions[key]; !exists {
				c.regions[key] = p
			}
		}

		for _, country := range p.Match.Countries {
			key := normalizeCountry(country)
			if _, exists := c.countries[key]; !exists {
				c.countries[key] = p
			}
		}

		if c.def == nil && p.Match.IsDefault {
			c.def = p
		}
		if c.fallback == nil && p.Match.Fallback {
			c.fallback = p
		}
	}

	return c
}

func (c *compiled) selectPolicy(country, region string) (*Config, MatchedBy) {
	if country != "" && region != "" {
		if p, ok := c.regions[regionKey(country, region)]; ok {
			return p, MatchedByRegion
		}
	}

	if country != "" {
		if p, ok := c.countries[country]; ok {
			return p, MatchedByCountry
		}
	}

	// Fallback covers unknown location only; a known country that matches
	// nothing falls through to the default.
	if country == "" && c.fallback != nil {
		return c.fallback, MatchedByFallback
	}

	if c.def != nil {
		return c.def, MatchedByDefault
	}

	return nil, ""
}

func mapPolicy(p Config) Resolved {
	model := modelOf(p)

	resolved := Resolved{
		ID:    p.ID,
		Model: model,
		I18n:  p.I18n,
		Consent: &ResolvedConsent{
			ScopeMode:             scopeModeOf(p),
			Categories:            categoriesOf(p, model),
			PreselectedCategories: preselectedOf(p, model),
		},
		Proof: p.Proof,
	}

	if p.Consent != nil {
		resolved.Consent.ExpiryDays = p.Consent.ExpiryDays
		resolved.Consent.GPC = p.Consent.GPC
	}

	if model != ModelIAB {
		resolved.UI = &ResolvedUI{}
		if p.UI != nil {
			resolved.UI.Mode = p.UI.Mode
			resolved.UI.Banner = normalizeSurface(p.UI.Banner)
			resolved.UI.Dialog = normalizeSurface(p.UI.Dialog)
		}
	}

	return resolved
}

func scopeModeOf(p Config) ScopeMode {
	if p.Consent != nil && p.Consent.ScopeMode != nil {
		return *p.Consent.ScopeMode
	}
	return ScopePermissive
}

func categoriesOf(p Config, model Model) []string {
	if model == ModelIAB {
		return []string{CategoryWildcard}
	}
	if p.Consent == nil {
		return nil
	}
	return dedupeTrimmed(p.Consent.Categories)
}

func preselectedOf(p Config, model Model) []string {
	if model == ModelIAB || p.Consent == nil || len(p.Consent.PreselectedCategories) == 0 {
		return nil
	}

	categories := categoriesOf(p, model)
	if scopeModeOf(p) != ScopeStrict || len(categories) == 0 || slices.Contains(categories, CategoryWildcard) {
		return dedupeTrimmed(p.Consent.PreselectedCategories)
	}

	var filtered []string
	for _, c := range p.Consent.PreselectedCategories {
		if slices.Contains(categories, c) {
			filtered = append(filtered, c)
		}
	}

	return dedupeTrimmed(filtered)
}

func normalizeSurface(s *UISurfaceConfig) *ResolvedUISurface {
	if s == nil {
		return nil
	}

	allowed := dedupeActions(s.AllowedActions)
	layout := normalizeLayout(s, allowed)

	effective := flatten(layout)
	if effective == nil {
		effective = allowed
	}

	return &ResolvedUISurface{
		AllowedActions: allowed,
		PrimaryActions: normalizePrimary(s.PrimaryActions, effective),
		Layout:         layout,
		Direction:      validDirection(s.Direction),
		UIProfile:      validProfile(s.UIProfile),
		ScrollLock:     s.ScrollLock,
	}
}

func normalizeLayout(s *UISurfaceConfig, allowed []UIAction) [][]UIAction {
	if len(s.Layout) == 0 {
		if len(allowed) > 0 {
			return [][]UIAction{allowed}
		}
		return nil
	}

	allowedSet := make(map[UIAction]struct{}, len(allowed))
	for _, a := range allowed {
		allowedSet[a] = struct{}{}
	}

	seen := make(map[UIAction]struct{})
	var groups [][]UIAction

	for _, group := range s.Layout {
		var normalized []UIAction
		for _, action := range dedupeActions(group) {
			if _, dup := seen[action]; dup {
				continue
			}
			if len(allowed) > 0 {
				if _, ok := allowedSet[action]; !ok {
					continue
				}
			}
			seen[action] = struct{}{}
			normalized = append(normalized, action)
		}
		if len(normalized) > 0 {
			groups = append(groups, normalized)
		}
	}

	return groups
}

func normalizePrimary(primary, allowed []UIAction) []UIAction {
	if len(primary) == 0 {
		return nil
	}
	if len(allowed) == 0 {
		return primary
	}

	var filtered []UIAction
	for _, p := range primary {
		if slices.Contains(allowed, p) {
			filtered = append(filtered, p)
		}
	}

	return filtered
}

func flatten(layout [][]UIAction) []UIAction {
	if len(layout) == 0 {
		return nil
	}

	var out []UIAction
	for _, group := range layout {
		out = append(out, group...)
	}
	return out
}

func validDirection(d *Direction) *Direction {
	if d == nil {
		return nil
	}
	if *d == DirectionRow || *d == DirectionColumn {
		return d
	}
	return nil
}

func validProfile(p *UIProfile) *UIProfile {
	if p == nil {
		return nil
	}
	switch *p {
	case ProfileBalanced, ProfileCompact, ProfileStrict:
		return p
	}
	return nil
}

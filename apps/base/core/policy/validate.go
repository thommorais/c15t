package policy

import (
	"errors"
	"fmt"
	"strings"
)

// Inspect reports configuration errors and warnings for a policy pack.
func Inspect(policies []Config, iabEnabled bool) ValidationResult {
	return ValidationResult{
		Errors:   collectErrors(policies, iabEnabled),
		Warnings: collectWarnings(policies),
	}
}

// Validate returns the first configuration error, if any.
func Validate(policies []Config, iabEnabled bool) error {
	if errs := collectErrors(policies, iabEnabled); len(errs) > 0 {
		return errors.New(errs[0])
	}
	return nil
}

func policyLabel(p Config, index int) string {
	if id := strings.TrimSpace(p.ID); id != "" {
		return fmt.Sprintf("'%s'", id)
	}
	return fmt.Sprintf("at index %d", index)
}

func hasExplicitMatchers(p Config) bool {
	return len(p.Match.Countries) > 0 || len(p.Match.Regions) > 0
}

func hasUIConfig(p Config) bool {
	if p.UI == nil {
		return false
	}
	if p.UI.Mode != nil {
		return true
	}
	return hasSurfaceConfig(p.UI.Banner) || hasSurfaceConfig(p.UI.Dialog)
}

func hasSurfaceConfig(s *UISurfaceConfig) bool {
	if s == nil {
		return false
	}
	return len(s.AllowedActions) > 0 ||
		len(s.PrimaryActions) > 0 ||
		len(s.Layout) > 0 ||
		s.Direction != nil ||
		s.UIProfile != nil ||
		s.ScrollLock != nil
}

func modelOf(p Config) Model {
	if p.Consent != nil && p.Consent.Model != nil {
		return *p.Consent.Model
	}
	return ModelOptIn
}

func collectErrors(policies []Config, iabEnabled bool) []string {
	var errs []string

	var defaults, fallbacks int
	for _, p := range policies {
		if p.Match.IsDefault {
			defaults++
		}
		if p.Match.Fallback {
			fallbacks++
		}
	}
	if defaults > 1 {
		errs = append(errs, "Only one default policy is allowed")
	}
	if fallbacks > 1 {
		errs = append(errs, "Only one fallback policy is allowed")
	}

	for _, p := range policies {
		if modelOf(p) != ModelIAB {
			continue
		}
		if !iabEnabled {
			errs = append(errs, `Policies using consent.model="iab" require top-level iab.enabled=true`)
		}
		if hasUIConfig(p) {
			errs = append(errs, fmt.Sprintf(
				`Policy '%s' uses consent.model="iab" and cannot define ui.* overrides. IAB banner/dialog controls are fixed by TCF mode.`,
				p.ID))
		}
		if p.Consent != nil && len(p.Consent.PreselectedCategories) > 0 {
			errs = append(errs, fmt.Sprintf(
				`Policy '%s' uses consent.model="iab" and cannot define consent.preselectedCategories.`,
				p.ID))
		}
		break
	}

	for i, p := range policies {
		errs = append(errs, surfaceErrors(p, i)...)
	}

	idToIndex := make(map[string]int, len(policies))
	for i, p := range policies {
		id := strings.TrimSpace(p.ID)
		if id == "" {
			errs = append(errs, fmt.Sprintf("Policy %s is missing a non-empty id.", policyLabel(p, i)))
			continue
		}

		if prev, dup := idToIndex[id]; dup {
			errs = append(errs, fmt.Sprintf(
				"Policy IDs must be unique. Duplicate id '%s' found at indexes %d and %d.", id, prev, i))
		} else {
			idToIndex[id] = i
		}

		if !p.Match.IsDefault && !p.Match.Fallback && !hasExplicitMatchers(p) {
			errs = append(errs, fmt.Sprintf(
				"Policy '%s' has no matcher. Add countries or regions, or set match.isDefault=true.", id))
		}
	}

	return errs
}

func surfaceErrors(p Config, index int) []string {
	if p.UI == nil {
		return nil
	}

	var errs []string
	label := policyLabel(p, index)

	for _, s := range []struct {
		name    string
		surface *UISurfaceConfig
	}{
		{"banner", p.UI.Banner},
		{"dialog", p.UI.Dialog},
	} {
		if s.surface == nil {
			continue
		}

		allowed := s.surface.AllowedActions
		allowedSet := make(map[UIAction]struct{}, len(allowed))
		for _, a := range allowed {
			allowedSet[a] = struct{}{}
		}

		if len(allowed) > 0 {
			for _, pa := range s.surface.PrimaryActions {
				if _, ok := allowedSet[pa]; !ok {
					errs = append(errs, fmt.Sprintf(
						"Policy %s ui.%s.primaryActions '%s' is not in allowedActions [%s].",
						label, s.name, pa, joinActions(allowed)))
				}
			}
		}

		if len(s.surface.Layout) == 0 {
			continue
		}

		seen := make(map[UIAction]struct{})
		for _, group := range s.surface.Layout {
			if len(group) == 0 {
				errs = append(errs, fmt.Sprintf(
					"Policy %s ui.%s.layout contains an empty action group.", label, s.name))
				continue
			}
			for _, action := range group {
				if len(allowed) > 0 {
					if _, ok := allowedSet[action]; !ok {
						errs = append(errs, fmt.Sprintf(
							"Policy %s ui.%s.layout contains '%s' which is not in allowedActions [%s].",
							label, s.name, action, joinActions(allowed)))
					}
				}
				if _, dup := seen[action]; dup {
					errs = append(errs, fmt.Sprintf(
						"Policy %s ui.%s.layout contains duplicate action '%s'.", label, s.name, action))
				}
				seen[action] = struct{}{}
			}
		}

		if len(allowed) > 0 && len(seen) != len(allowed) {
			var missing []UIAction
			for _, a := range allowed {
				if _, ok := seen[a]; !ok {
					missing = append(missing, a)
				}
			}
			if len(missing) > 0 {
				errs = append(errs, fmt.Sprintf(
					"Policy %s ui.%s.layout must include every allowed action. Missing [%s].",
					label, s.name, joinActions(missing)))
			}
		}
	}

	return errs
}

func collectWarnings(policies []Config) []string {
	if len(policies) == 0 {
		return nil
	}

	var warnings []string
	seen := make(map[string]struct{})
	add := func(w string) {
		if _, dup := seen[w]; dup {
			return
		}
		seen[w] = struct{}{}
		warnings = append(warnings, w)
	}

	var defaults, fallbacks int
	for _, p := range policies {
		if p.Match.IsDefault {
			defaults++
		}
		if p.Match.Fallback {
			fallbacks++
		}
	}
	if defaults == 0 {
		add("No default policy configured. Requests that do not match region/country will have no active policy.")
	}
	if fallbacks == 0 {
		add("No fallback policy configured. If geo-location fails, no policy will apply. Mark a strict policy with match.fallback=true.")
	}

	seenCountries := make(map[string]string)
	seenRegions := make(map[string]string)

	for i, p := range policies {
		id := strings.TrimSpace(p.ID)
		if id == "" {
			id = fmt.Sprintf("policy_index_%d", i)
		}

		if p.Match.IsDefault && hasExplicitMatchers(p) {
			add(fmt.Sprintf(
				"Policy %s is marked as default and also defines explicit matchers. Explicit matchers are ignored for default resolution.",
				policyLabel(p, i)))
		}

		for _, country := range p.Match.Countries {
			key := normalizeCountry(country)
			if prev, dup := seenCountries[key]; dup {
				add(fmt.Sprintf(
					"Country matcher '%s' appears in multiple policies (%s and '%s'). First match wins by array order.",
					key, prev, id))
			} else {
				seenCountries[key] = "'" + id + "'"
			}
		}

		for _, region := range p.Match.Regions {
			r := normalizeRegion(region)
			key := r.Country + "-" + r.Region
			if prev, dup := seenRegions[key]; dup {
				add(fmt.Sprintf(
					"Region matcher '%s' appears in multiple policies (%s and '%s'). First match wins by array order.",
					key, prev, id))
			} else {
				seenRegions[key] = "'" + id + "'"
			}
		}
	}

	return warnings
}

func joinActions(actions []UIAction) string {
	parts := make([]string, len(actions))
	for i, a := range actions {
		parts[i] = string(a)
	}
	return strings.Join(parts, ", ")
}

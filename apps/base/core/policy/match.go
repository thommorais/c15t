package policy

import "strings"

var (
	euCountries = []string{
		"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
		"HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
		"SI", "ES", "SE",
	}
	eeaExtra    = []string{"IS", "LI", "NO"}
	ukCountries = []string{"GB"}
)

// MatchDatasetVersion tracks revisions of the built-in country and region tables.
const MatchDatasetVersion = "2026-03-10"

func normalizeCountry(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

// A region code may arrive prefixed with its country ("US-CA"), in which case
// only the trailing subdivision is significant.
func normalizeRegionCode(code string) string {
	code = strings.TrimSpace(code)
	if i := strings.LastIndex(code, "-"); i >= 0 {
		code = code[i+1:]
	}
	return strings.ToUpper(strings.TrimSpace(code))
}

func normalizeRegion(r Region) Region {
	return Region{
		Country: normalizeCountry(r.Country),
		Region:  normalizeRegionCode(r.Region),
	}
}

func MatchDefault() Match {
	return Match{IsDefault: true}
}

func MatchFallback() Match {
	return Match{Fallback: true}
}

func MatchCountries(countries []string) Match {
	return Match{Countries: dedupeCountries(countries)}
}

func MatchRegions(regions []Region) Match {
	out := make([]Region, 0, len(regions))
	for _, r := range regions {
		out = append(out, normalizeRegion(r))
	}
	return Match{Regions: out}
}

func MatchEU() Match {
	return MatchCountries(euCountries)
}

func MatchEEA() Match {
	return MatchCountries(append(append([]string{}, euCountries...), eeaExtra...))
}

func MatchUK() Match {
	return MatchCountries(ukCountries)
}

func MatchIAB() Match {
	return MatchMerge(MatchEEA(), MatchUK())
}

func MatchMerge(matches ...Match) Match {
	var merged Match

	for _, m := range matches {
		if m.IsDefault {
			merged.IsDefault = true
		}
		if m.Fallback {
			merged.Fallback = true
		}
		if len(m.Countries) > 0 {
			merged.Countries = dedupeCountries(append(merged.Countries, m.Countries...))
		}
		if len(m.Regions) > 0 {
			merged.Regions = dedupeRegions(append(merged.Regions, m.Regions...))
		}
	}

	return merged
}

func dedupeCountries(countries []string) []string {
	seen := make(map[string]struct{}, len(countries))
	out := make([]string, 0, len(countries))

	for _, c := range countries {
		c = normalizeCountry(c)
		if c == "" {
			continue
		}
		if _, dup := seen[c]; dup {
			continue
		}
		seen[c] = struct{}{}
		out = append(out, c)
	}

	return out
}

func dedupeRegions(regions []Region) []Region {
	seen := make(map[string]struct{}, len(regions))
	out := make([]Region, 0, len(regions))

	for _, r := range regions {
		r = normalizeRegion(r)
		key := regionKey(r.Country, r.Region)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, r)
	}

	return out
}

func regionKey(country, region string) string {
	return country + ":" + region
}

func dedupeTrimmed(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))

	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, dup := seen[v]; dup {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}

	if len(out) == 0 {
		return nil
	}
	return out
}

func dedupeActions(actions []UIAction) []UIAction {
	if len(actions) == 0 {
		return nil
	}

	seen := make(map[UIAction]struct{}, len(actions))
	out := make([]UIAction, 0, len(actions))

	for _, a := range actions {
		if _, dup := seen[a]; dup {
			continue
		}
		seen[a] = struct{}{}
		out = append(out, a)
	}

	return out
}

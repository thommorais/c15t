package policyrule

import (
	"strconv"
	"strings"
)

const (
	ContractVersion = 1
	ContractHeader  = "x-c15t-policy-contract"
	SafeFallbackID  = "c15t_safe_fallback"

	StatusUnconfigured = "unconfigured"
	StatusNoMatch      = "no-match"
	StatusFailed       = "failed"
	StatusMatched      = "matched"

	ReasonInvalidConfiguration = "invalid-configuration"
	ReasonInsufficientInputs   = "insufficient-inputs"
	ReasonUnsupportedContract  = "unsupported-contract"

	MatchedByRegion   = "region"
	MatchedByCountry  = "country"
	MatchedByDefault  = "default"
	MatchedByFallback = "fallback"
)

type Resolution struct {
	Fingerprints *Fingerprints       `json:"fingerprints,omitempty"`
	MatchedBy    string              `json:"matchedBy,omitempty"`
	Policy       *ResolvedPolicyRule `json:"policy"`
	PolicyID     string              `json:"policyId,omitempty"`
	Reason       string              `json:"reason,omitempty"`
	Status       string              `json:"status"`
}

type WireResolution struct {
	Resolution
	Version int `json:"version"`
}

func Wire(r Resolution) WireResolution {
	return WireResolution{Resolution: r, Version: ContractVersion}
}

var failedConfiguration = Resolution{Status: StatusFailed, Reason: ReasonInvalidConfiguration}

// ResolveInput carries a nil Rules when no policy system is configured, and a
// nil IABEnabled when the caller does not vouch for IAB support.
type ResolveInput struct {
	Rules      *[]PolicyRule
	Country    string
	Region     string
	IABEnabled *bool
}

func Resolve(in ResolveInput) Resolution {
	if in.Rules == nil {
		return Resolution{Status: StatusUnconfigured}
	}
	rules := *in.Rules
	var opts *InspectOptions
	if in.IABEnabled != nil {
		opts = &InspectOptions{IABEnabled: *in.IABEnabled}
	}
	if len(Inspect(rules, opts).Errors) > 0 {
		return failedConfiguration
	}
	if len(rules) == 0 {
		return Resolution{Status: StatusNoMatch}
	}

	outcome := match(rules, in.Country, in.Region)
	switch outcome.status {
	case ReasonInsufficientInputs:
		return Resolution{Status: StatusFailed, Reason: ReasonInsufficientInputs}
	case StatusNoMatch:
		return Resolution{Status: StatusNoMatch}
	}
	rule := rules[outcome.index]
	policy, err := Normalize(rule)
	if err != nil {
		return failedConfiguration
	}
	fingerprints, err := RuleFingerprints(policy, rule.LegacyMaterial)
	if err != nil {
		return failedConfiguration
	}
	return Resolution{
		Fingerprints: &fingerprints,
		MatchedBy:    outcome.matchedBy,
		Policy:       &policy,
		PolicyID:     policy.ID,
		Status:       StatusMatched,
	}
}

func normalizeCountry(code string) string {
	return strings.ToUpper(trim(code))
}

func normalizeRegion(code string) string {
	if i := strings.LastIndex(code, "-"); i >= 0 {
		code = code[i+1:]
	}
	return strings.ToUpper(trim(code))
}

type matchOutcome struct {
	status    string
	index     int
	matchedBy string
}

func matchesCountry(codes []string, country string) bool {
	for _, c := range codes {
		if normalizeCountry(c) == country {
			return true
		}
	}
	return false
}

func findRule(rules []PolicyRule, pred func(Match) bool) int {
	for i, r := range rules {
		if r.Match != nil && pred(*r.Match) {
			return i
		}
	}
	return -1
}

func matched(index int, by string) matchOutcome {
	return matchOutcome{status: StatusMatched, index: index, matchedBy: by}
}

// match applies the reference precedence: region, country, the country's
// missing-region fallback, the global fallback for an unknown country, then
// the default.
func match(rules []PolicyRule, rawCountry, rawRegion string) matchOutcome {
	country, region := normalizeCountry(rawCountry), normalizeRegion(rawRegion)

	if country != "" && region != "" {
		if i := findRule(rules, func(m Match) bool {
			for _, r := range m.Regions {
				if normalizeCountry(r.Country) == country && normalizeRegion(r.Region) == region {
					return true
				}
			}
			return false
		}); i >= 0 {
			return matched(i, MatchedByRegion)
		}
	}
	if country != "" {
		if i := findRule(rules, func(m Match) bool { return matchesCountry(m.Countries, country) }); i >= 0 {
			return matched(i, MatchedByCountry)
		}
		if region == "" {
			if outcome, ok := matchMissingRegion(rules, country); ok {
				return outcome
			}
		}
	}

	fallback := findRule(rules, func(m Match) bool { return m.Fallback })
	if country == "" && fallback >= 0 {
		return matched(fallback, MatchedByFallback)
	}
	if i := findRule(rules, func(m Match) bool { return m.IsDefault }); i >= 0 {
		return matched(i, MatchedByDefault)
	}
	if country == "" {
		return matchOutcome{status: ReasonInsufficientInputs}
	}
	return matchOutcome{status: StatusNoMatch}
}

func matchMissingRegion(rules []PolicyRule, country string) (matchOutcome, bool) {
	if i := findRule(rules, func(m Match) bool { return matchesCountry(m.RegionFallbacks, country) }); i >= 0 {
		return matched(i, MatchedByFallback), true
	}
	hasRegionRules := findRule(rules, func(m Match) bool {
		for _, r := range m.Regions {
			if normalizeCountry(r.Country) == country {
				return true
			}
		}
		return false
	}) >= 0
	if !hasRegionRules {
		return matchOutcome{}, false
	}
	if i := findRule(rules, func(m Match) bool { return m.Fallback }); i >= 0 {
		return matched(i, MatchedByFallback), true
	}
	return matchOutcome{status: ReasonInsufficientInputs}, true
}

// SafeFallback is the rule every non-matched outcome runs on. Its
// fingerprints are constants so no caller hashes on that path.
func SafeFallback() (ResolvedPolicyRule, Fingerprints) {
	return ResolvedPolicyRule{
		Actions: ActionConstraints{
			Allowed:    []string{"accept", "customize", "reject"},
			Equivalent: [][]string{{"accept", "reject"}},
			Required:   []string{"accept", "reject"},
		},
		ID:                    SafeFallbackID,
		Model:                 ModelOptIn,
		PreselectedCategories: []string{},
		PrivacySignals:        ResolvedPrivacySignals{GPC: GPC{DenyCategories: []string{}}},
		Prompt:                PromptChoice,
		Rights:                []string{"disclosure", "preferences"},
		Scope:                 []string{"experience", "functionality", "marketing", "measurement"},
		ScopeMode:             ScopeStrict,
		Validity:              ResolvedValidity{ChoiceMs: 31_536_000_000, NoticeMs: 31_536_000_000},
	}, Fingerprints{
		Choice: "145fd951c0967e210d905acf5859a93cd03095c0291816b9c424d740048b7a47",
		Notice: "4b563e76133c49a5e14cffd9c0a0cc16885b811d9ff77548165cc01ee94996d7",
		Policy: "caadd5bcf45bf76cbc279b3dfe765f2dcd165c510f489c38994e4c9264d9314f",
	}
}

func ParseContractHeader(value string) (int, bool) {
	trimmed := trim(value)
	if trimmed == "" {
		return 0, false
	}
	for i := range len(trimmed) {
		if trimmed[i] < '0' || trimmed[i] > '9' {
			return 0, false
		}
	}
	n, err := strconv.Atoi(trimmed)
	return n, err == nil
}

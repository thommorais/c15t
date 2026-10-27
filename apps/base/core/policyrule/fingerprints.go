package policyrule

import "slices"

const fingerprintVersion = 1

type Fingerprints struct {
	Choice         string `json:"choice"`
	LegacyMaterial string `json:"legacyMaterial,omitempty"`
	Notice         string `json:"notice"`
	Policy         string `json:"policy"`
}

type gpcInput struct {
	GPC GPC `json:"gpc"`
}

type policyInput struct {
	Actions               ActionConstraints `json:"actions"`
	CopyRevision          *string           `json:"copyRevision"`
	Domain                string            `json:"domain"`
	Model                 string            `json:"model"`
	PreselectedCategories []string          `json:"preselectedCategories"`
	PrivacySignals        gpcInput          `json:"privacySignals"`
	Prompt                string            `json:"prompt"`
	Proof                 Proof             `json:"proof"`
	Rights                []string          `json:"rights"`
	Scope                 []string          `json:"scope"`
	ScopeMode             string            `json:"scopeMode"`
	Validity              ResolvedValidity  `json:"validity"`
	Version               int               `json:"version"`
}

type promptInput struct {
	CopyRevision    *string  `json:"copyRevision"`
	Domain          string   `json:"domain"`
	Model           string   `json:"model"`
	PrivacySignals  gpcInput `json:"privacySignals"`
	Prompt          string   `json:"prompt"`
	RequiredActions []string `json:"requiredActions"`
	Rights          []string `json:"rights"`
	Scope           []string `json:"scope"`
	ScopeMode       string   `json:"scopeMode"`
	ValidityMs      float64  `json:"validityMs"`
	Version         int      `json:"version"`
}

func sortedGroups(groups [][]string) [][]string {
	out := make([][]string, len(groups))
	for i, g := range groups {
		out[i] = canonicalSet(g)
	}
	slices.SortStableFunc(out, func(a, b []string) int {
		return compareCanonical(joinComma(a), joinComma(b))
	})
	return out
}

func joinComma(values []string) string {
	s := ""
	for i, v := range values {
		if i > 0 {
			s += ","
		}
		s += v
	}
	return s
}

func promptFingerprintInput(r ResolvedPolicyRule, domain string, validityMs float64) promptInput {
	return promptInput{
		CopyRevision:    r.CopyRevision,
		Domain:          domain,
		Model:           r.Model,
		PrivacySignals:  gpcInput{GPC{DenyCategories: canonicalSet(r.PrivacySignals.GPC.DenyCategories)}},
		Prompt:          r.Prompt,
		RequiredActions: canonicalSet(r.Actions.Required),
		Rights:          canonicalSet(r.Rights),
		Scope:           canonicalSet(r.Scope),
		ScopeMode:       r.ScopeMode,
		ValidityMs:      validityMs,
		Version:         fingerprintVersion,
	}
}

// RuleFingerprints hashes a resolved rule per domain. With legacy material,
// legacyMaterial carries the 2.x fingerprint while the policy is unchanged.
func RuleFingerprints(r ResolvedPolicyRule, legacy *LegacyMaterial) (Fingerprints, error) {
	policy, err := Fingerprint(policyInput{
		Actions: ActionConstraints{
			Allowed:    canonicalSet(r.Actions.Allowed),
			Equivalent: sortedGroups(r.Actions.Equivalent),
			Required:   canonicalSet(r.Actions.Required),
		},
		CopyRevision:          r.CopyRevision,
		Domain:                "policy",
		Model:                 r.Model,
		PreselectedCategories: canonicalSet(r.PreselectedCategories),
		PrivacySignals:        gpcInput{GPC{DenyCategories: canonicalSet(r.PrivacySignals.GPC.DenyCategories)}},
		Prompt:                r.Prompt,
		Proof:                 r.Proof,
		Rights:                canonicalSet(r.Rights),
		Scope:                 canonicalSet(r.Scope),
		ScopeMode:             r.ScopeMode,
		Validity:              r.Validity,
		Version:               fingerprintVersion,
	})
	if err != nil {
		return Fingerprints{}, err
	}
	choice, err := Fingerprint(promptFingerprintInput(r, "choice", r.Validity.ChoiceMs))
	if err != nil {
		return Fingerprints{}, err
	}
	notice, err := Fingerprint(promptFingerprintInput(r, "notice", r.Validity.NoticeMs))
	if err != nil {
		return Fingerprints{}, err
	}
	f := Fingerprints{Choice: choice, Notice: notice, Policy: policy}
	if legacy != nil {
		if policy != legacy.PolicyFingerprint {
			f.LegacyMaterial = "policy-changed:" + policy
		} else if f.LegacyMaterial, err = Fingerprint(legacy.Input); err != nil {
			return Fingerprints{}, err
		}
	}
	return f, nil
}

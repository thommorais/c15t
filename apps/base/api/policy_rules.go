package api

import (
	"thom/core/policy"
	"thom/core/policyrule"
)

func defaultRules() []policyrule.PolicyRule {
	rules := policyrule.RecommendedRules(false)
	brazil, _ := policyrule.Preset("brazilOptIn")
	// Keep the existing deployment's Brazil coverage alongside upstream's
	// recommended rules, which include regional fallbacks for US states.
	return append(rules, brazil)
}

func projectRule(r policyrule.ResolvedPolicyRule) policy.Resolved {
	expiryDays := int(r.Validity.ChoiceMs / 86_400_000)
	gpc := len(r.PrivacySignals.GPC.DenyCategories) > 0
	mode := policy.UIModeBanner
	if r.Prompt == policyrule.PromptNone {
		mode = policy.UIModeNone
	}
	resolved := policy.Resolved{
		Rule: &r, ID: r.ID, Model: policy.Model(r.Model),
		Consent: &policy.ResolvedConsent{
			ExpiryDays: &expiryDays, ScopeMode: policy.ScopeMode(r.ScopeMode),
			Categories: r.Scope, PreselectedCategories: r.PreselectedCategories, GPC: &gpc,
		},
		Proof: &policy.ProofConfig{StoreIP: &r.Proof.StoreIP, StoreUserAgent: &r.Proof.StoreUserAgent, StoreLanguage: &r.Proof.StoreLanguage},
		UI:    &policy.ResolvedUI{Mode: &mode},
	}
	if r.I18n != nil {
		resolved.I18n = &policy.I18n{Language: &r.I18n.Language, MessageProfile: &r.I18n.MessageProfile}
	}
	return resolved
}

// legacyResolution lets existing Go configurations participate in the v3 wire
// contract. New hosts configure PolicyRules directly.
func legacyResolution(d *policy.Decision) policyrule.Resolution {
	if d == nil {
		return policyrule.Resolution{Status: policyrule.StatusNoMatch}
	}
	p := d.Policy
	rule := policyrule.PolicyRule{
		ID: p.ID, Model: string(p.Model), Match: &policyrule.Match{IsDefault: true},
		Prompt: policyrule.PromptChoice,
		Proof:  &policyrule.Proof{StoreIP: p.Proof.StoresIP(), StoreUserAgent: p.Proof.StoresUserAgent(), StoreLanguage: p.Proof.StoresLanguage()},
	}
	if p.Model == policy.ModelNone {
		rule.Prompt = policyrule.PromptNone
	}
	if p.Model == policy.ModelOptOut && p.UI != nil && p.UI.Mode != nil && *p.UI.Mode == policy.UIModeNone {
		rule.Prompt = policyrule.PromptNone
	}
	if p.Consent != nil {
		c := p.Consent
		rule.Categories, rule.PreselectedCategories, rule.ScopeMode = c.Categories, c.PreselectedCategories, string(c.ScopeMode)
		if c.ExpiryDays != nil && *c.ExpiryDays > 0 {
			days := float64(*c.ExpiryDays)
			rule.Validity = &policyrule.Validity{ChoiceDays: &days}
		}
		if c.GPC != nil && *c.GPC {
			rule.PrivacySignals = &policyrule.PrivacySignals{GPC: &policyrule.GPC{DenyCategories: []string{"marketing", "measurement"}}}
		}
	}
	if p.I18n != nil {
		rule.I18n = &policyrule.I18n{}
		if p.I18n.Language != nil {
			rule.I18n.Language = *p.I18n.Language
		}
		if p.I18n.MessageProfile != nil {
			rule.I18n.MessageProfile = *p.I18n.MessageProfile
		}
	}
	resolved, err := policyrule.Normalize(rule)
	if err != nil {
		return policyrule.Resolution{Status: policyrule.StatusFailed, Reason: policyrule.ReasonInvalidConfiguration}
	}
	fingerprints, err := policyrule.RuleFingerprints(resolved, nil)
	if err != nil {
		return policyrule.Resolution{Status: policyrule.StatusFailed, Reason: policyrule.ReasonInvalidConfiguration}
	}
	return policyrule.Resolution{Status: policyrule.StatusMatched, Policy: &resolved, PolicyID: p.ID, Fingerprints: &fingerprints, MatchedBy: string(d.MatchedBy)}
}

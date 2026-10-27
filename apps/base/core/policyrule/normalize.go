package policyrule

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

func expectedActions(prompt string, configured []string) ActionConstraints {
	switch prompt {
	case PromptChoice:
		allowed := configured
		if allowed == nil {
			allowed = choiceActions
		}
		return ActionConstraints{
			Allowed:    canonicalSet(append(slices.Clone(allowed), "accept", "reject")),
			Equivalent: [][]string{{"accept", "reject"}},
			Required:   []string{"accept", "reject"},
		}
	case PromptNotice:
		return ActionConstraints{Allowed: []string{"dismiss"}, Equivalent: [][]string{}, Required: []string{"dismiss"}}
	}
	return ActionConstraints{Allowed: []string{}, Equivalent: [][]string{}, Required: []string{}}
}

func requiredRights(model string) []string {
	if model == ModelNone {
		return []string{}
	}
	required := []string{"disclosure", "preferences"}
	if model == ModelOptOut {
		required = append(required, "opt-out")
	}
	return canonicalSet(required)
}

func days(v *float64, fallback float64) float64 {
	if v == nil {
		return fallback * dayMs
	}
	return *v * dayMs
}

func Normalize(rule PolicyRule) (ResolvedPolicyRule, error) {
	if errs := ruleErrors(rule, 0); len(errs) > 0 {
		return ResolvedPolicyRule{}, errors.New(errs[0])
	}

	var copyRevision *string
	if c := trim(rule.CopyRevision); c != "" {
		copyRevision = &c
	}

	preselected := []string{}
	if rule.Model != ModelIAB && rule.Model != ModelNone {
		var trimmed []string
		for _, c := range rule.PreselectedCategories {
			if c = trim(c); isOptionalCategory(c) {
				trimmed = append(trimmed, c)
			}
		}
		preselected = canonicalSet(trimmed)
	}

	deny := []string{}
	if rule.PrivacySignals != nil && rule.PrivacySignals.GPC != nil {
		deny = canonicalSet(slices.DeleteFunc(slices.Clone(rule.PrivacySignals.GPC.DenyCategories), func(c string) bool { return !isOptionalCategory(c) }))
	}

	var validity Validity
	if rule.Validity != nil {
		validity = *rule.Validity
	}

	scopeMode := rule.ScopeMode
	if scopeMode == "" {
		scopeMode = ScopePermissive
	}

	var proof Proof
	if rule.Proof != nil {
		proof = *rule.Proof
	}

	resolved := ResolvedPolicyRule{
		Actions:               expectedActions(rule.Prompt, rule.Actions),
		CopyRevision:          copyRevision,
		I18n:                  resolveI18n(rule.I18n),
		ID:                    trim(rule.ID),
		Model:                 rule.Model,
		PreselectedCategories: preselected,
		PrivacySignals:        ResolvedPrivacySignals{GPC: GPC{DenyCategories: deny}},
		Prompt:                rule.Prompt,
		Proof:                 proof,
		Rights:                canonicalSet(append(requiredRights(rule.Model), rule.Rights...)),
		Scope:                 resolveScope(rule.Categories),
		ScopeMode:             scopeMode,
		Validity: ResolvedValidity{
			ChoiceMs: days(validity.ChoiceDays, DefaultChoiceValidityDays),
			NoticeMs: days(validity.NoticeDays, DefaultNoticeValidityDays),
		},
	}
	if issues := resolvedIssues(resolved); len(issues) > 0 {
		return ResolvedPolicyRule{}, fmt.Errorf("Policy '%s': %s", resolved.ID, issues[0])
	}
	return resolved, nil
}

func resolveI18n(i *I18n) *I18n {
	if i == nil || (i.Language == "" && i.MessageProfile == "") {
		return nil
	}
	return &I18n{Language: i.Language, MessageProfile: i.MessageProfile}
}

func sameSet(left, right []string) bool {
	l, r := canonicalSet(left), canonicalSet(right)
	return slices.Equal(l, r)
}

func hasDuplicates(values []string) bool {
	return len(canonicalSet(values)) != len(values)
}

func isValidMs(v float64) bool {
	return v > 0 && v <= maxSafeInteger
}

func resolvedIssues(r ResolvedPolicyRule) []string {
	var issues []string
	if trim(r.ID) == "" {
		issues = append(issues, "id must be a non-empty string")
	}
	if !slices.Contains(modelPrompts[r.Model], r.Prompt) {
		issues = append(issues, fmt.Sprintf("model %s does not allow prompt %s", quote(r.Model), quote(r.Prompt)))
	}
	if hasDuplicates(r.Scope) {
		issues = append(issues, "scope must not repeat a category")
	}
	if hasDuplicates(r.PreselectedCategories) {
		issues = append(issues, "preselectedCategories must not repeat a category")
	}
	if (r.Model == ModelIAB || r.Model == ModelNone) && len(r.PreselectedCategories) > 0 {
		issues = append(issues, r.Model+" rules cannot preselect categories")
	}
	if !isSubset(r.PreselectedCategories, r.Scope) {
		issues = append(issues, "preselectedCategories must be inside scope")
	}
	issues = append(issues, actionIssues(r)...)
	if hasDuplicates(r.Rights) {
		issues = append(issues, "rights must not repeat a right")
	}
	if required := requiredRights(r.Model); !isSubset(required, r.Rights) {
		issues = append(issues, fmt.Sprintf("model %s requires rights [%s]", quote(r.Model), strings.Join(required, ", ")))
	}
	if !isValidMs(r.Validity.ChoiceMs) || !isValidMs(r.Validity.NoticeMs) {
		issues = append(issues, "validity must be finite, positive and within the safe range")
	}
	deny := r.PrivacySignals.GPC.DenyCategories
	if hasDuplicates(deny) {
		issues = append(issues, "privacySignals.gpc.denyCategories must not repeat a category")
	}
	if !isSubset(deny, r.Scope) {
		issues = append(issues, "privacySignals.gpc.denyCategories must be inside scope")
	}
	if r.CopyRevision != nil && trim(*r.CopyRevision) == "" {
		issues = append(issues, "copyRevision must be null or a non-empty string")
	}
	return issues
}

func isSubset(values, of []string) bool {
	for _, v := range values {
		if !slices.Contains(of, v) {
			return false
		}
	}
	return true
}

func actionIssues(r ResolvedPolicyRule) []string {
	var issues []string
	expected := expectedActions(r.Prompt, nil)
	a := r.Actions
	if hasDuplicates(a.Allowed) || hasDuplicates(a.Required) {
		issues = append(issues, "actions must not repeat an action")
	}
	if !sameSet(a.Required, expected.Required) {
		issues = append(issues, fmt.Sprintf("prompt %s requires actions [%s]", quote(r.Prompt), strings.Join(expected.Required, ", ")))
	}
	if !isSubset(a.Required, a.Allowed) {
		issues = append(issues, "actions.allowed must include every required action")
	}
	if r.Prompt == PromptChoice {
		if !isSubset(a.Allowed, choiceActions) {
			issues = append(issues, "choice prompts allow only accept, reject and customize")
		}
		if len(a.Equivalent) != 1 || !sameSet(a.Equivalent[0], []string{"accept", "reject"}) {
			issues = append(issues, "choice prompts require the accept/reject equivalence group")
		}
		return issues
	}
	if !sameSet(a.Allowed, expected.Allowed) {
		issues = append(issues, fmt.Sprintf("prompt %s allows actions [%s]", quote(r.Prompt), strings.Join(expected.Allowed, ", ")))
	}
	if len(a.Equivalent) != 0 {
		issues = append(issues, fmt.Sprintf("prompt %s has no equivalence groups", quote(r.Prompt)))
	}
	return issues
}

package policyrule

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"unicode"
)

type InspectOptions struct {
	IABEnabled bool `json:"iabEnabled"`
}

type Inspection struct {
	Errors   []string
	Warnings []string
}

// trim matches String.prototype.trim, which also strips U+FEFF.
func trim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool { return unicode.IsSpace(r) || r == 0xFEFF })
}

func quote(s string) string { return `"` + s + `"` }

func isOptionalCategory(s string) bool { return slices.Contains(optionalCategories, s) }

func canonicalSet(values []string) []string {
	out := []string{}
	for _, v := range values {
		if !slices.Contains(out, v) {
			out = append(out, v)
		}
	}
	slices.SortFunc(out, compareCanonical)
	return out
}

func isValidDays(v float64) bool {
	ms := v * dayMs
	return !math.IsInf(v, 0) && !math.IsNaN(v) && v > 0 &&
		math.Abs(math.Round(ms)) <= maxSafeInteger && ms <= maxSafeInteger
}

func label(id string, index int) string {
	if trim(id) != "" {
		return "'" + trim(id) + "'"
	}
	return fmt.Sprintf("at index %d", index)
}

type ruleCheck struct {
	errors []string
	label  string
	rule   PolicyRule
}

func (c *ruleCheck) add(format string, args ...any) {
	c.errors = append(c.errors, fmt.Sprintf("Policy "+c.label+" "+format, args...))
}

func resolveScope(categories []string) []string {
	if categories == nil {
		return slices.Clone(optionalCategories)
	}
	var optional []string
	for _, c := range categories {
		c = trim(c)
		if c == categoryWildcard {
			return slices.Clone(optionalCategories)
		}
		if isOptionalCategory(c) {
			optional = append(optional, c)
		}
	}
	if len(optional) == 0 {
		return slices.Clone(optionalCategories)
	}
	return canonicalSet(optional)
}

func (c *ruleCheck) matchErrors() {
	m := c.rule.Match
	if m == nil {
		c.add("is missing the required 'match' object.")
		return
	}
	for _, field := range []struct {
		name  string
		codes []string
	}{{"countries", m.Countries}, {"regionFallbacks", m.RegionFallbacks}} {
		if slices.ContainsFunc(field.codes, func(code string) bool { return trim(code) == "" }) {
			c.add("match.%s cannot contain empty codes.", field.name)
		}
	}
	for i, r := range m.Regions {
		if trim(r.Country) == "" {
			c.add("match.regions[%d].country must be a non-empty string.", i)
		}
		if trim(r.Region) == "" {
			c.add("match.regions[%d].region must be a non-empty string.", i)
		}
	}
	if !m.IsDefault && !m.Fallback && !hasExplicitMatchers(m) {
		c.add("has no matcher. Add countries or regions, or set match.isDefault=true.")
	}
}

func hasExplicitMatchers(m *Match) bool {
	return len(m.Countries) > 0 || len(m.Regions) > 0 || len(m.RegionFallbacks) > 0
}

func (c *ruleCheck) modelPromptErrors() {
	model, prompt := c.rule.Model, c.rule.Prompt
	if !slices.Contains(ruleModels, model) {
		c.add("model must be one of %s.", strings.Join(ruleModels, ", "))
		return
	}
	if !slices.Contains(prompts, prompt) {
		c.add("prompt must be one of %s.", strings.Join(prompts, ", "))
		return
	}
	if !slices.Contains(modelPrompts[model], prompt) {
		c.add("model %s allows prompts [%s], received %s.", quote(model), strings.Join(modelPrompts[model], ", "), quote(prompt))
	}
}

func (c *ruleCheck) categoryListErrors(field string, values []string, allowWildcard bool) {
	for _, category := range values {
		t := trim(category)
		if t == "necessary" || (allowWildcard && t == categoryWildcard) {
			continue
		}
		if !isOptionalCategory(t) {
			c.add("%s has unknown category %s. Known categories: %s.", field, quote(category), strings.Join(consentCategories, ", "))
		}
	}
}

func (c *ruleCheck) scopeErrors() {
	r := c.rule
	c.categoryListErrors("categories", r.Categories, true)
	if r.ScopeMode == "" && len(resolveScope(r.Categories)) < len(optionalCategories) {
		c.add(`must set scopeMode to "strict" or "permissive" when categories selects only part of the optional categories.`)
	}
	if r.ScopeMode != "" && r.ScopeMode != ScopeStrict && r.ScopeMode != ScopePermissive {
		c.add(`scopeMode must be "strict" or "permissive".`)
	}
	if r.Model == ModelIAB || r.Model == ModelNone {
		if r.PreselectedCategories != nil {
			c.add("uses model %s and cannot define preselectedCategories.", quote(r.Model))
		}
		return
	}
	c.categoryListErrors("preselectedCategories", r.PreselectedCategories, false)
	scope := resolveScope(r.Categories)
	for _, category := range r.PreselectedCategories {
		t := trim(category)
		if isOptionalCategory(t) && !slices.Contains(scope, t) {
			c.add("preselectedCategories %s is outside the policy scope.", quote(t))
		}
	}
}

func (c *ruleCheck) actionErrors() {
	actions := c.rule.Actions
	if actions == nil {
		return
	}
	if c.rule.Prompt != PromptChoice {
		c.add(`actions can only be configured for prompt "choice".`)
		return
	}
	for _, action := range actions {
		if !slices.Contains(choiceActions, action) {
			c.add("actions has unknown action %s. Choice prompts accept accept, reject, customize.", quote(action))
		}
	}
	for _, required := range []string{"accept", "reject"} {
		if !slices.Contains(actions, required) {
			c.add("actions must include %s. A choice prompt cannot drop it.", quote(required))
		}
	}
}

func (c *ruleCheck) rightsErrors() {
	for _, right := range c.rule.Rights {
		if !slices.Contains(rights, right) {
			c.add("rights has unknown right %s. Known rights: %s.", quote(right), strings.Join(rights, ", "))
		}
	}
}

func (c *ruleCheck) validityErrors() {
	v := c.rule.Validity
	if v == nil {
		return
	}
	if v.ChoiceDays != nil && !isValidDays(*v.ChoiceDays) {
		c.add("validity.choiceDays must be a finite number of days greater than zero.")
	}
	if v.NoticeDays != nil && !isValidDays(*v.NoticeDays) {
		c.add("validity.noticeDays must be a finite number of days greater than zero.")
	}
}

func (c *ruleCheck) privacySignalErrors() {
	ps := c.rule.PrivacySignals
	if ps == nil || ps.GPC == nil {
		return
	}
	deny := ps.GPC.DenyCategories
	if deny == nil {
		c.add("privacySignals.gpc.denyCategories must be an array of category names.")
		return
	}
	scope := resolveScope(c.rule.Categories)
	var seen []string
	for _, category := range deny {
		switch {
		case category == "necessary":
			c.add(`privacySignals.gpc.denyCategories cannot deny "necessary".`)
		case !isOptionalCategory(category):
			c.add("privacySignals.gpc.denyCategories has unknown category %s.", quote(category))
		case slices.Contains(seen, category):
			c.add("privacySignals.gpc.denyCategories repeats %s.", quote(category))
		default:
			seen = append(seen, category)
			if !slices.Contains(scope, category) {
				c.add("privacySignals.gpc.denyCategories %s is outside the policy scope.", quote(category))
			}
		}
	}
}

func (c *ruleCheck) metadataErrors() {
	if r := c.rule.Review; r != nil && r.Status != "pending" && r.Status != "reviewed" {
		c.add(`review.status must be "pending" or "reviewed".`)
	}
	if l := c.rule.LegacyMaterial; l != nil && !l.valid() {
		c.add("legacyMaterial must contain a frozen input and policyFingerprint.")
	}
}

func ruleErrors(rule PolicyRule, index int) []string {
	c := &ruleCheck{label: label(rule.ID, index), rule: rule}
	if trim(rule.ID) == "" {
		c.add("is missing a non-empty id.")
	}
	c.matchErrors()
	c.modelPromptErrors()
	c.scopeErrors()
	c.actionErrors()
	c.rightsErrors()
	c.validityErrors()
	c.privacySignalErrors()
	c.metadataErrors()
	return c.errors
}

func packErrors(rules []PolicyRule, opts *InspectOptions) []string {
	var errs []string
	defaults, fallbacks := 0, 0
	usesIAB := false
	for _, r := range rules {
		if r.Match != nil && r.Match.IsDefault {
			defaults++
		}
		if r.Match != nil && r.Match.Fallback {
			fallbacks++
		}
		usesIAB = usesIAB || r.Model == ModelIAB
	}
	if defaults > 1 {
		errs = append(errs, "Only one default policy is allowed")
	}
	if fallbacks > 1 {
		errs = append(errs, "Only one fallback policy is allowed")
	}
	if usesIAB && opts != nil && !opts.IABEnabled {
		errs = append(errs, `Policies using model="iab" require top-level iab.enabled=true`)
	}
	firstIndex := map[string]int{}
	for i, r := range rules {
		id := trim(r.ID)
		if id == "" {
			continue
		}
		if previous, ok := firstIndex[id]; ok {
			errs = append(errs, fmt.Sprintf("Policy IDs must be unique. Duplicate id '%s' found at indexes %d and %d.", id, previous, i))
			continue
		}
		firstIndex[id] = i
	}
	return errs
}

type warnings struct{ list []string }

func (w *warnings) add(s string) {
	if !slices.Contains(w.list, s) {
		w.list = append(w.list, s)
	}
}

func packWarnings(rules []PolicyRule) []string {
	if len(rules) == 0 {
		return nil
	}
	w := &warnings{}
	matches := make([]Match, len(rules))
	for i, r := range rules {
		if r.Match != nil {
			matches[i] = *r.Match
		}
	}
	if !slices.ContainsFunc(matches, func(m Match) bool { return m.IsDefault }) {
		w.add("No default policy configured. Requests that do not match region/country resolve to no-match and use the safe opt-in choice fallback.")
	}
	if !slices.ContainsFunc(matches, func(m Match) bool { return m.Fallback }) {
		w.add("No fallback policy configured. If geo-location fails, resolution fails and uses the safe opt-in choice fallback. Mark a strict policy with match.fallback=true.")
	}
	for i, r := range rules {
		if matches[i].IsDefault && hasExplicitMatchers(&matches[i]) {
			w.add(fmt.Sprintf("Policy %s is marked as default and also defines explicit matchers. Explicit matchers are ignored for default resolution.", label(r.ID, i)))
		}
	}
	countries, regions := map[string]string{}, map[string]string{}
	for i, r := range rules {
		id := trim(r.ID)
		if id == "" {
			id = fmt.Sprintf("policy_index_%d", i)
		}
		for _, country := range matches[i].Countries {
			key := strings.ToUpper(trim(country))
			if existing, ok := countries[key]; ok {
				w.add(fmt.Sprintf("Country matcher '%s' appears in multiple policies (%s and '%s'). First match wins by array order.", key, existing, id))
			} else {
				countries[key] = "'" + id + "'"
			}
		}
		for _, region := range matches[i].Regions {
			key := strings.ToUpper(trim(region.Country)) + "-" + strings.ToUpper(trim(region.Region))
			if existing, ok := regions[key]; ok {
				w.add(fmt.Sprintf("Region matcher '%s' appears in multiple policies (%s and '%s'). First match wins by array order.", key, existing, id))
			} else {
				regions[key] = "'" + id + "'"
			}
		}
	}
	return w.list
}

func Inspect(rules []PolicyRule, opts *InspectOptions) Inspection {
	var errs []string
	for i, r := range rules {
		errs = append(errs, ruleErrors(r, i)...)
	}
	errs = append(errs, packErrors(rules, opts)...)
	return Inspection{Errors: errs, Warnings: packWarnings(rules)}
}

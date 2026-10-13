package i18n

import "fmt"

// PolicyI18n is what a policy asks of the translations, kept apart from the
// policy package so neither depends on the other.
type PolicyI18n struct {
	PolicyID string
	Language string
	Profile  string
}

// Check finds what Resolve would only discover per request. An error is a
// policy that can never get the translations it names; a warning is a setup
// that works but probably not as meant.
func (m Messages) Check(policies []PolicyI18n) ([]string, error) {
	var warnings []string

	name := m.DefaultProfile
	if name == "" {
		name = defaultProfile
	}
	if _, ok := m.Profiles[name]; len(m.Profiles) > 0 && !ok {
		warnings = append(warnings, fmt.Sprintf("default profile %q is not configured", name))
	}

	for _, p := range policies {
		if p.Profile == "" && p.Language == "" {
			warnings = append(warnings, fmt.Sprintf("policy %q sets i18n without a language or messageProfile", p.PolicyID))
			continue
		}

		active := name
		if p.Profile != "" {
			profile, ok := m.Profiles[p.Profile]
			if !ok {
				return nil, fmt.Errorf("policy %q names i18n profile %q, which is not configured", p.PolicyID, p.Profile)
			}
			if len(profile.Translations) == 0 {
				return nil, fmt.Errorf("policy %q names i18n profile %q, which has no translations", p.PolicyID, p.Profile)
			}
			active = p.Profile
		}

		language := firstTag(p.Language)
		if language == "" {
			continue
		}

		if len(m.Profiles) == 0 {
			if _, ok := matchTag(language, canonical); !ok {
				return nil, fmt.Errorf("policy %q i18n language %q is not bundled", p.PolicyID, p.Language)
			}
			continue
		}

		if len(m.Profiles[active].Translations) == 0 {
			return nil, fmt.Errorf("policy %q i18n language %q has no translation in profile %q and no fallback", p.PolicyID, p.Language, active)
		}
	}

	return warnings, nil
}

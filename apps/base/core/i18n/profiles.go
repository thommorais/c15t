package i18n

import (
	"fmt"
	"sort"
	"strings"
)

const defaultProfile = "default"

// Profile is one set of operator messages: per language, the strings that
// replace the bundled ones. A string it leaves out keeps the bundled value.
type Profile struct {
	FallbackLanguage string
	Translations     map[string]Translations
}

// Messages are the operator's profiles. A policy names one with its
// messageProfile; every other request uses DefaultProfile, "default" when
// empty. With no profiles at all the bundle is served as it is.
type Messages struct {
	DefaultProfile string
	Profiles       map[string]Profile
}

// Warning is a resolution that fell back. Key is stable for one cause, so a
// caller can log each once.
type Warning struct {
	Key     string
	Message string
}

// Resolve picks the language and strings for a request. With profiles
// configured, only the active profile's languages are offered: a policy
// language the profile lacks gets the profile's fallback, not the header's
// choice.
func (m Messages) Resolve(acceptLanguage, policyLanguage, policyProfile string) (Result, []Warning) {
	if len(m.Profiles) == 0 {
		return Resolve(acceptLanguage, policyLanguage), nil
	}

	var warnings []Warning

	name := m.DefaultProfile
	if name == "" {
		name = defaultProfile
	}
	if policyProfile != "" {
		if _, ok := m.Profiles[policyProfile]; ok {
			name = policyProfile
		} else {
			warnings = append(warnings, Warning{
				Key:     "i18n.profile.missing:" + policyProfile,
				Message: fmt.Sprintf("policy i18n profile %q does not exist, using %q", policyProfile, name),
			})
		}
	}

	profile := m.Profiles[name]
	offered := make(map[string]string, len(profile.Translations))
	names := make([]string, 0, len(profile.Translations))
	for language := range profile.Translations {
		offered[strings.ToLower(language)] = language
		names = append(names, language)
	}
	sort.Strings(names)
	fallback := profile.fallback(offered, names)

	requested := firstTag(policyLanguage)
	if requested == "" {
		requested = Select(acceptLanguage, names, fallback)
	}

	language, custom := "", Translations(nil)
	if match, ok := matchTag(strings.ToLower(requested), offered); ok {
		language, custom = match, profile.Translations[match]
	} else if match, ok := offered[strings.ToLower(fallback)]; ok {
		language, custom = match, profile.Translations[match]
		warnings = append(warnings, Warning{
			Key:     fmt.Sprintf("i18n.fallback:%s:%s:%s", name, requested, match),
			Message: fmt.Sprintf("profile %q has no %q, using its fallback %q", name, requested, match),
		})
	} else if match, ok := matchTag(strings.ToLower(requested), canonical); ok {
		language = match
	} else {
		language = fallbackLanguage
		warnings = append(warnings, Warning{
			Key:     "i18n.base-fallback:" + requested,
			Message: fmt.Sprintf("no translation for %q, using %q", requested, fallbackLanguage),
		})
	}

	base, ok := Lookup(language)
	if !ok {
		base, _ = Lookup(fallbackLanguage)
	}
	out := copyWithout(base, "iab")
	mergeInto(out, copyWithout(custom, "iab"))

	return Result{Language: language, Translations: out}, warnings
}

// fallback is the configured language when the profile has it, else English,
// else the first language the profile has.
func (p Profile) fallback(offered map[string]string, names []string) string {
	configured := firstTag(p.FallbackLanguage)
	if configured == "" {
		configured = fallbackLanguage
	}
	if match, ok := offered[configured]; ok {
		return match
	}
	if match, ok := offered[fallbackLanguage]; ok {
		return match
	}
	if len(names) > 0 {
		return names[0]
	}
	return configured
}

func mergeInto(dst, src map[string]any) {
	for key, value := range src {
		if from, ok := value.(map[string]any); ok {
			if into, ok := dst[key].(map[string]any); ok {
				mergeInto(into, from)
				continue
			}
		}
		dst[key] = value
	}
}

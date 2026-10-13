package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"strings"

	"thom/core/i18n"
)

var languageTag = regexp.MustCompile(`^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$`)

const profileSettings = "profile.json"

// loadMessages reads one directory per profile holding one <language>.json per
// language and an optional profile.json. Top-level files and dotfiles are
// skipped so the directory can carry a README.
func loadMessages(fsys fs.FS) (i18n.Messages, error) {
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return i18n.Messages{}, err
	}

	messages := i18n.Messages{Profiles: map[string]i18n.Profile{}}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		profile, err := loadProfile(fsys, entry.Name())
		if err != nil {
			return i18n.Messages{}, err
		}
		messages.Profiles[entry.Name()] = profile
	}
	return messages, nil
}

func loadProfile(fsys fs.FS, name string) (i18n.Profile, error) {
	entries, err := fs.ReadDir(fsys, name)
	if err != nil {
		return i18n.Profile{}, err
	}

	profile := i18n.Profile{Translations: map[string]i18n.Translations{}}
	for _, entry := range entries {
		file := path.Join(name, entry.Name())
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if entry.IsDir() {
			return i18n.Profile{}, fmt.Errorf("%s: a profile holds only <language>.json files", file)
		}

		raw, err := fs.ReadFile(fsys, file)
		if err != nil {
			return i18n.Profile{}, err
		}

		if entry.Name() == profileSettings {
			var settings struct {
				FallbackLanguage string `json:"fallbackLanguage"`
			}
			if err := decodeStrict(raw, &settings); err != nil {
				return i18n.Profile{}, fmt.Errorf("%s: %w", file, err)
			}
			if settings.FallbackLanguage != "" && !languageTag.MatchString(settings.FallbackLanguage) {
				return i18n.Profile{}, fmt.Errorf("%s: fallbackLanguage %q is not a language tag", file, settings.FallbackLanguage)
			}
			profile.FallbackLanguage = settings.FallbackLanguage
			continue
		}

		language, isJSON := strings.CutSuffix(entry.Name(), ".json")
		if !isJSON {
			return i18n.Profile{}, fmt.Errorf("%s: a profile holds only <language>.json files", file)
		}
		if !languageTag.MatchString(language) {
			return i18n.Profile{}, fmt.Errorf("%s: %q is not a language tag", file, language)
		}

		var translations i18n.Translations
		if err := decodeStrict(raw, &translations); err != nil {
			return i18n.Profile{}, fmt.Errorf("%s: %w", file, err)
		}
		if err := i18n.CheckOverride(translations); err != nil {
			return i18n.Profile{}, fmt.Errorf("%s: %w", file, err)
		}
		profile.Translations[language] = translations
	}
	return profile, nil
}

func decodeStrict(raw []byte, into any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	return decoder.Decode(into)
}

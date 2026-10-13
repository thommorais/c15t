package i18n

import (
	"strings"
	"testing"
)

func override(section, key, value string) Translations {
	return Translations{section: map[string]any{key: value}}
}

func acceptAll(t *testing.T, r Result) string {
	t.Helper()
	common, ok := r.Translations["common"].(map[string]any)
	if !ok {
		t.Fatalf("the result has no common section: %v", r.Translations)
	}
	value, _ := common["acceptAll"].(string)
	return value
}

func bundled(t *testing.T, language, section, key string) string {
	t.Helper()
	full, ok := Lookup(language)
	if !ok {
		t.Fatalf("%s is not bundled", language)
	}
	value, _ := full[section].(map[string]any)[key].(string)
	return value
}

func TestMessagesMergeAProfileOverTheBundle(t *testing.T) {
	m := Messages{Profiles: map[string]Profile{
		"default": {Translations: map[string]Translations{
			"pt-BR": override("common", "acceptAll", "Concordo"),
		}},
	}}

	got, _ := m.Resolve("pt-BR", "", "")

	if got.Language != "pt-BR" {
		t.Fatalf("Language = %q, want pt-BR", got.Language)
	}
	if acceptAll(t, got) != "Concordo" {
		t.Errorf("acceptAll = %q, want the profile's", acceptAll(t, got))
	}
	common := got.Translations["common"].(map[string]any)
	if common["save"] != bundled(t, "pt-BR", "common", "save") {
		t.Errorf("save = %q, want the bundled pt-BR string kept", common["save"])
	}
	if got.Translations["cookieBanner"] == nil {
		t.Error("sections the profile does not touch must come from the bundle")
	}
	if _, ok := got.Translations["iab"]; ok {
		t.Error("the iab section must not be sent")
	}
}

func TestMessagesOfferOnlyTheProfileLanguages(t *testing.T) {
	profile := func(fallback string, languages ...string) Messages {
		translations := map[string]Translations{}
		for _, l := range languages {
			translations[l] = override("common", "acceptAll", l)
		}
		return Messages{Profiles: map[string]Profile{
			"default": {FallbackLanguage: fallback, Translations: translations},
		}}
	}

	tests := []struct {
		name     string
		messages Messages
		header   string
		want     string
	}{
		{name: "a profile language matches the header", messages: profile("", "en", "de"), header: "de-AT", want: "de"},
		{name: "a bundled language outside the profile is not offered", messages: profile("", "en", "pt-BR"), header: "de", want: "en"},
		{name: "the configured fallback is used when the profile has it", messages: profile("pt-BR", "en", "pt-BR"), header: "de", want: "pt-BR"},
		{name: "the fallback matches case insensitively", messages: profile("PT-br", "en", "pt-BR"), header: "de", want: "pt-BR"},
		{name: "a fallback the profile lacks gives way to english", messages: profile("fr", "en", "pt-BR"), header: "de", want: "en"},
		{name: "without english the first profile language is the fallback", messages: profile("fr", "pt-BR", "es"), header: "de", want: "es"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _ := tt.messages.Resolve(tt.header, "", "")
			if got.Language != tt.want {
				t.Errorf("Language = %q, want %q", got.Language, tt.want)
			}
			if acceptAll(t, got) != tt.want {
				t.Errorf("acceptAll = %q, want the %s profile string", acceptAll(t, got), tt.want)
			}
		})
	}
}

func TestMessagesPolicyProfile(t *testing.T) {
	m := Messages{
		DefaultProfile: "main",
		Profiles: map[string]Profile{
			"main":   {Translations: map[string]Translations{"en": override("common", "acceptAll", "main")}},
			"strict": {Translations: map[string]Translations{"en": override("common", "acceptAll", "strict")}},
		},
	}

	got, warnings := m.Resolve("en", "", "strict")
	if acceptAll(t, got) != "strict" {
		t.Errorf("acceptAll = %q, want the policy's profile", acceptAll(t, got))
	}
	if len(warnings) != 0 {
		t.Errorf("warnings = %v, want none", warnings)
	}

	got, warnings = m.Resolve("en", "", "missing")
	if acceptAll(t, got) != "main" {
		t.Errorf("acceptAll = %q, want the default profile when the policy's is missing", acceptAll(t, got))
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0].Message, "missing") {
		t.Errorf("warnings = %v, want one naming the missing profile", warnings)
	}
}

func TestMessagesPolicyLanguage(t *testing.T) {
	m := Messages{Profiles: map[string]Profile{
		"default": {Translations: map[string]Translations{
			"en": override("common", "acceptAll", "en"),
			"de": override("common", "acceptAll", "de"),
		}},
	}}

	got, warnings := m.Resolve("en", "de-DE", "")
	if got.Language != "de" || acceptAll(t, got) != "de" {
		t.Errorf("got %q / %q, want the policy language over the header", got.Language, acceptAll(t, got))
	}
	if len(warnings) != 0 {
		t.Errorf("warnings = %v, want none", warnings)
	}

	got, warnings = m.Resolve("de", "fr", "")
	if got.Language != "en" || acceptAll(t, got) != "en" {
		t.Errorf("got %q / %q, want the profile fallback for a language the profile lacks", got.Language, acceptAll(t, got))
	}
	if len(warnings) != 1 {
		t.Errorf("warnings = %v, want one for the fallback", warnings)
	}
}

func TestMessagesLanguageOutsideTheBundle(t *testing.T) {
	m := Messages{Profiles: map[string]Profile{
		"default": {Translations: map[string]Translations{
			"tlh": override("common", "acceptAll", "HIja'"),
		}},
	}}

	got, _ := m.Resolve("tlh", "", "")

	if got.Language != "tlh" || acceptAll(t, got) != "HIja'" {
		t.Errorf("got %q / %q, want the profile language and string", got.Language, acceptAll(t, got))
	}
	common := got.Translations["common"].(map[string]any)
	if common["save"] != bundled(t, "en", "common", "save") {
		t.Errorf("save = %q, want english under a language the bundle lacks", common["save"])
	}
}

func TestMessagesWithoutAMatchingProfileUseTheBundle(t *testing.T) {
	m := Messages{Profiles: map[string]Profile{
		"other": {Translations: map[string]Translations{"en": override("common", "acceptAll", "other")}},
	}}

	got, _ := m.Resolve("en", "de", "")

	if got.Language != "de" {
		t.Errorf("Language = %q, want the bundled policy language", got.Language)
	}
	if acceptAll(t, got) != bundled(t, "de", "common", "acceptAll") {
		t.Errorf("acceptAll = %q, want the bundled string", acceptAll(t, got))
	}
}

func TestMessagesWithoutProfilesMatchResolve(t *testing.T) {
	for _, tc := range [][2]string{{"de-DE", ""}, {"fr", "de"}, {"de", "xx"}, {"", ""}} {
		got, warnings := Messages{}.Resolve(tc[0], tc[1], "")
		if want := Resolve(tc[0], tc[1]); got.Language != want.Language {
			t.Errorf("Resolve(%q, %q) = %q, want %q", tc[0], tc[1], got.Language, want.Language)
		}
		if len(warnings) != 0 {
			t.Errorf("Resolve(%q, %q) warned %v", tc[0], tc[1], warnings)
		}
	}
}

func TestMessagesDoNotLetACallerChangeAProfile(t *testing.T) {
	m := Messages{Profiles: map[string]Profile{
		"default": {Translations: map[string]Translations{"en": override("common", "acceptAll", "kept")}},
	}}

	first, _ := m.Resolve("en", "", "")
	first.Translations["common"].(map[string]any)["acceptAll"] = "changed"

	if got, _ := m.Resolve("en", "", ""); acceptAll(t, got) != "kept" {
		t.Error("a caller's edit leaked into the profile")
	}
}

func TestCheckOverride(t *testing.T) {
	tests := []struct {
		name     string
		override Translations
		wantErr  string
	}{
		{name: "a bundled key", override: override("common", "acceptAll", "Yes")},
		{name: "a nested bundled key", override: Translations{"consentTypes": map[string]any{"necessary": map[string]any{"title": "Needed"}}}},
		{name: "the iab section", override: Translations{"iab": map[string]any{"banner": map[string]any{"title": "TCF"}}}},
		{name: "an unknown section", override: override("cookiebanner", "title", "x"), wantErr: "cookiebanner"},
		{name: "an unknown key", override: override("common", "acceptAl", "x"), wantErr: "common.acceptAl"},
		{name: "a string where the bundle has a section", override: Translations{"common": "x"}, wantErr: "common"},
		{name: "a section where the bundle has a string", override: Translations{"common": map[string]any{"acceptAll": map[string]any{"x": "y"}}}, wantErr: "common.acceptAll"},
		{name: "a value that is not a string", override: Translations{"common": map[string]any{"acceptAll": 1.0}}, wantErr: "common.acceptAll"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CheckOverride(tt.override)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("CheckOverride = %v, want nil", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("CheckOverride = %v, want an error naming %q", err, tt.wantErr)
			}
		})
	}
}

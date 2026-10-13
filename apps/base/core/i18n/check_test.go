package i18n

import (
	"strings"
	"testing"
)

func TestCheck(t *testing.T) {
	configured := Messages{Profiles: map[string]Profile{
		"default": {Translations: map[string]Translations{"en": {}, "pt-BR": {}}},
		"strict":  {Translations: map[string]Translations{"de": {}}},
		"empty":   {Translations: map[string]Translations{}},
	}}

	tests := []struct {
		name         string
		messages     Messages
		policies     []PolicyI18n
		wantErr      string
		wantWarnings []string
	}{
		{name: "no profiles and a bundled policy language", policies: []PolicyI18n{{PolicyID: "br", Language: "pt-BR"}}},
		{name: "no profiles and a policy language the bundle lacks", policies: []PolicyI18n{{PolicyID: "kl", Language: "tlh"}}, wantErr: `policy "kl"`},
		{name: "a policy names a profile that exists", messages: configured, policies: []PolicyI18n{{PolicyID: "de", Profile: "strict"}}},
		{name: "a policy names a missing profile", messages: configured, policies: []PolicyI18n{{PolicyID: "de", Profile: "lax"}}, wantErr: `"lax"`},
		{name: "a policy names a profile without translations", messages: configured, policies: []PolicyI18n{{PolicyID: "de", Profile: "empty"}}, wantErr: `"empty"`},
		{name: "a policy language the profile has", messages: configured, policies: []PolicyI18n{{PolicyID: "br", Language: "pt-br"}}},
		{name: "a policy language the profile lacks falls back", messages: configured, policies: []PolicyI18n{{PolicyID: "fr", Language: "fr"}}},
		{
			name:     "a policy language with no profile to fall back on",
			messages: Messages{DefaultProfile: "main", Profiles: map[string]Profile{"strict": {Translations: map[string]Translations{"de": {}}}}},
			policies: []PolicyI18n{{PolicyID: "fr", Language: "fr"}},
			wantErr:  `policy "fr"`,
		},
		{name: "a missing default profile", messages: Messages{DefaultProfile: "main", Profiles: configured.Profiles}, wantWarnings: []string{`default profile "main"`}},
		{name: "policy i18n with neither field", messages: configured, policies: []PolicyI18n{{PolicyID: "blank"}}, wantWarnings: []string{`policy "blank"`}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			warnings, err := tt.messages.Check(tt.policies)

			if tt.wantErr == "" && err != nil {
				t.Fatalf("Check = %v, want no error", err)
			}
			if tt.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tt.wantErr)) {
				t.Fatalf("Check = %v, want an error naming %s", err, tt.wantErr)
			}

			if len(warnings) != len(tt.wantWarnings) {
				t.Fatalf("warnings = %q, want %d", warnings, len(tt.wantWarnings))
			}
			for i, want := range tt.wantWarnings {
				if !strings.Contains(warnings[i], want) {
					t.Errorf("warnings[%d] = %q, want one naming %s", i, warnings[i], want)
				}
			}
		})
	}
}

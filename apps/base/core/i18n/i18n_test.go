package i18n

import (
	"slices"
	"strings"
	"testing"
)

func flatten(prefix string, v any, out map[string]string) {
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			flatten(prefix+k+".", child, out)
		}
	case string:
		out[strings.TrimSuffix(prefix, ".")] = t
	}
}

func flat(t *testing.T, language string) map[string]string {
	t.Helper()

	translations, ok := Lookup(language)
	if !ok {
		t.Fatalf("Lookup(%q) found nothing", language)
	}

	out := map[string]string{}
	flatten("", map[string]any(translations), out)
	return out
}

func TestEveryLanguageIsBundledWithTheSameKeys(t *testing.T) {
	languages := Languages()
	if len(languages) != 37 {
		t.Fatalf("languages = %d, want the 35 reference languages plus pt-BR and pt-PT: %v", len(languages), languages)
	}
	for _, want := range []string{"en", "de", "pt", "pt-BR", "pt-PT"} {
		if !slices.Contains(languages, want) {
			t.Errorf("language %q is not bundled", want)
		}
	}

	reference := flat(t, "en")
	for _, language := range languages {
		got := flat(t, language)
		for key := range reference {
			value, ok := got[key]
			if !ok {
				t.Errorf("%s is missing %s", language, key)
				continue
			}
			if value == "" {
				t.Errorf("%s has an empty %s", language, key)
			}
		}
		for key := range got {
			if _, ok := reference[key]; !ok {
				t.Errorf("%s has %s, which en does not", language, key)
			}
		}
	}
}

func TestPlaceholdersSurviveTranslation(t *testing.T) {
	for _, language := range Languages() {
		got := flat(t, language)
		for _, key := range []string{"frame.title", "frame.actionButton"} {
			if !strings.Contains(got[key], "{category}") {
				t.Errorf("%s %s = %q, want the {category} placeholder", language, key, got[key])
			}
		}
	}
}

func TestPortugueseVariantsAreSeparate(t *testing.T) {
	br, pt := flat(t, "pt-BR"), flat(t, "pt-PT")

	if br["common.save"] == pt["common.save"] {
		t.Errorf("pt-BR and pt-PT share common.save = %q", br["common.save"])
	}
	if br["frame.loading"] == pt["frame.loading"] {
		t.Errorf("pt-BR and pt-PT share frame.loading = %q", br["frame.loading"])
	}

	for _, language := range []string{"pt-BR", "pt-PT"} {
		for _, key := range []string{"frame.policyBlocked", "frame.loading", "frame.error"} {
			if got := flat(t, language)[key]; got == flat(t, "en")[key] {
				t.Errorf("%s %s is still the English reference text %q", language, key, got)
			}
		}
	}
}

func TestSelect(t *testing.T) {
	available := []string{"en", "de", "pt", "pt-BR", "pt-PT", "zh"}

	tests := []struct {
		name     string
		header   string
		fallback string
		want     string
	}{
		{name: "primary subtag", header: "de-DE,en;q=0.9", fallback: "en", want: "de"},
		{name: "unsupported falls back", header: "xx-XX,yy;q=0.9", fallback: "en", want: "en"},
		{name: "second choice when the first is unsupported", header: "xx-XX,en;q=0.9,de;q=0.8", fallback: "de", want: "en"},
		{name: "quality beats position", header: "en;q=0.5,de;q=0.9", fallback: "en", want: "de"},
		{name: "ties keep header order", header: "de;q=0.8,en;q=0.8", fallback: "zh", want: "de"},
		{name: "q=0 is not acceptable", header: "de;q=0,en", fallback: "zh", want: "en"},
		{name: "empty header", header: "", fallback: "de", want: "de"},
		{name: "case and spaces", header: "  DE-de ", fallback: "en", want: "de"},
		{name: "brazilian portuguese", header: "pt-BR,pt;q=0.9", fallback: "en", want: "pt-BR"},
		{name: "lowercase region", header: "pt-br", fallback: "en", want: "pt-BR"},
		{name: "european portuguese", header: "pt-PT", fallback: "en", want: "pt-PT"},
		{name: "bare portuguese keeps the reference file", header: "pt", fallback: "en", want: "pt"},
		{name: "other portuguese region uses the reference file", header: "pt-AO", fallback: "en", want: "pt"},
		{name: "region without its own file uses the language", header: "zh-TW", fallback: "en", want: "zh"},
		{name: "malformed quality is ignored", header: "de;q=abc", fallback: "en", want: "de"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Select(tt.header, available, tt.fallback); got != tt.want {
				t.Errorf("Select(%q) = %q, want %q", tt.header, got, tt.want)
			}
		})
	}

	if got := Select("de", nil, "en"); got != "en" {
		t.Errorf("no available languages: got %q, want the fallback", got)
	}
}

func TestResolve(t *testing.T) {
	tests := []struct {
		name   string
		header string
		policy string
		want   string
	}{
		{name: "header drives the language", header: "de-DE", want: "de"},
		{name: "no header is english", header: "", want: "en"},
		{name: "policy language wins over the header", header: "fr", policy: "de", want: "de"},
		{name: "policy language keeps its region", header: "en", policy: "pt-BR", want: "pt-BR"},
		{name: "policy language is case insensitive", header: "en", policy: "PT-pt", want: "pt-PT"},
		{name: "unsupported policy language is english, not the header", header: "de", policy: "xx", want: "en"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Resolve(tt.header, tt.policy)
			if got.Language != tt.want {
				t.Errorf("Resolve(%q, %q).Language = %q, want %q", tt.header, tt.policy, got.Language, tt.want)
			}
			if _, ok := got.Translations["common"]; !ok {
				t.Error("the result carries no translations")
			}
		})
	}
}

func TestResolveLeavesOutTheIABSection(t *testing.T) {
	if _, ok := Resolve("en", "").Translations["iab"]; ok {
		t.Error("the iab section must not be sent when IAB is not in use")
	}
	if full, _ := Lookup("en"); full["iab"] == nil {
		t.Error("Lookup must still return the full set, iab included")
	}
}

func TestResolveDoesNotLetACallerChangeTheBundle(t *testing.T) {
	first := Resolve("en", "")
	first.Translations["common"].(map[string]any)["acceptAll"] = "changed"

	if got := Resolve("en", "").Translations["common"].(map[string]any)["acceptAll"]; got == "changed" {
		t.Error("a caller's edit leaked into the shared bundle")
	}
}

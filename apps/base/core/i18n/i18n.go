// Package i18n holds the bundled consent notice translations and picks the
// language to show a visitor.
package i18n

import (
	"embed"
	"encoding/json"
	"fmt"
	"path"
	"slices"
	"sort"
	"strconv"
	"strings"
)

//go:embed data/*.json
var files embed.FS

const fallbackLanguage = "en"

// Translations is one language's strings, grouped by section.
type Translations map[string]any

var (
	bundle    = map[string]Translations{}
	canonical = map[string]string{}
	languages []string
)

func init() {
	entries, err := files.ReadDir("data")
	if err != nil {
		panic(err)
	}

	for _, entry := range entries {
		name := strings.TrimSuffix(entry.Name(), ".json")

		raw, err := files.ReadFile(path.Join("data", entry.Name()))
		if err != nil {
			panic(err)
		}

		var translations Translations
		if err := json.Unmarshal(raw, &translations); err != nil {
			panic(fmt.Sprintf("i18n: %s: %v", entry.Name(), err))
		}

		bundle[name] = translations
		canonical[strings.ToLower(name)] = name
		languages = append(languages, name)
	}

	sort.Strings(languages)
}

// Languages lists the bundled language tags, sorted.
func Languages() []string {
	return slices.Clone(languages)
}

// Lookup returns the full bundled set for a language. The result is shared and
// must be treated as read only.
func Lookup(language string) (Translations, bool) {
	name, ok := canonical[strings.ToLower(strings.TrimSpace(language))]
	if !ok {
		return nil, false
	}
	return bundle[name], true
}

// Result is what a visitor is shown: the language chosen and its strings.
type Result struct {
	Language     string       `json:"language"`
	Translations Translations `json:"translations"`
}

// Resolve picks the language for a request. A policy's own language wins over
// the Accept-Language header, and an unsupported policy language falls back to
// English rather than to the header. The IAB section is left out because it is
// only used when IAB is. The result is a copy the caller may change.
func Resolve(acceptLanguage, policyLanguage string) Result {
	language := fallbackLanguage

	if policy := firstTag(policyLanguage); policy != "" {
		if match, ok := matchTag(policy, canonical); ok {
			language = match
		}
	} else {
		language = Select(acceptLanguage, languages, fallbackLanguage)
	}

	full, _ := Lookup(language)
	return Result{Language: language, Translations: copyWithout(full, "iab")}
}

// Select picks the best of the available languages for an Accept-Language
// header. Languages are tried in order of quality, then position. Each is
// matched on the full tag first, so pt-BR reaches pt-BR, and then on its
// primary subtag, so de-DE reaches de. A quality of 0 means not acceptable.
func Select(header string, available []string, fallback string) string {
	if len(available) == 0 {
		return fallback
	}

	lookup := make(map[string]string, len(available))
	for _, language := range available {
		lookup[strings.ToLower(language)] = language
	}

	for _, tag := range preferences(header) {
		if match, ok := matchTag(tag, lookup); ok {
			return match
		}
	}

	return fallback
}

func matchTag(tag string, lookup map[string]string) (string, bool) {
	if match, ok := lookup[tag]; ok {
		return match, true
	}
	if primary, _, found := strings.Cut(tag, "-"); found {
		if match, ok := lookup[primary]; ok {
			return match, true
		}
	}
	return "", false
}

type preference struct {
	tag     string
	quality float64
	index   int
}

func preferences(header string) []string {
	var found []preference

	for index, part := range strings.Split(header, ",") {
		fields := strings.Split(part, ";")

		tag := strings.ToLower(strings.TrimSpace(fields[0]))
		if tag == "" {
			continue
		}

		quality := 1.0
		for _, param := range fields[1:] {
			param = strings.ToLower(strings.TrimSpace(param))
			value, isQuality := strings.CutPrefix(param, "q=")
			if !isQuality {
				continue
			}
			if parsed, err := strconv.ParseFloat(value, 64); err == nil {
				quality = parsed
			}
			break
		}

		if quality <= 0 {
			continue
		}
		found = append(found, preference{tag: tag, quality: quality, index: index})
	}

	sort.SliceStable(found, func(i, j int) bool {
		if found[i].quality != found[j].quality {
			return found[i].quality > found[j].quality
		}
		return found[i].index < found[j].index
	})

	tags := make([]string, 0, len(found))
	seen := map[string]struct{}{}
	for _, p := range found {
		if _, dup := seen[p.tag]; dup {
			continue
		}
		seen[p.tag] = struct{}{}
		tags = append(tags, p.tag)
	}
	return tags
}

func firstTag(value string) string {
	first, _, _ := strings.Cut(value, ",")
	first, _, _ = strings.Cut(first, ";")
	return strings.ToLower(strings.TrimSpace(first))
}

func copyWithout(src Translations, drop string) Translations {
	out := make(Translations, len(src))
	for key, value := range src {
		if key != drop {
			out[key] = deepCopy(value)
		}
	}
	return out
}

func deepCopy(value any) any {
	if m, ok := value.(map[string]any); ok {
		out := make(map[string]any, len(m))
		for k, v := range m {
			out[k] = deepCopy(v)
		}
		return out
	}
	return value
}

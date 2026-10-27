package policyrule

import (
	"encoding/json"
	"os"
	"testing"
)

type resolutionVectors struct {
	Packs map[string]struct {
		Rules      json.RawMessage `json:"rules"`
		IABEnabled *bool           `json:"iabEnabled"`
	} `json:"packs"`
	Resolutions []struct {
		Pack    string          `json:"pack"`
		Country *string         `json:"country"`
		Region  *string         `json:"region"`
		Wire    json.RawMessage `json:"wire"`
	} `json:"resolutions"`
	Fallback struct {
		Rule         json.RawMessage `json:"rule"`
		Fingerprints Fingerprints    `json:"fingerprints"`
	} `json:"fallback"`
	Headers []struct {
		Value  *string `json:"value"`
		Parsed *int    `json:"parsed"`
	} `json:"headers"`
}

func loadResolutionVectors(t *testing.T) resolutionVectors {
	t.Helper()
	raw, err := os.ReadFile("testdata/resolution.json")
	if err != nil {
		t.Fatal(err)
	}
	var v resolutionVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func TestResolveMatchesReference(t *testing.T) {
	v := loadResolutionVectors(t)
	packs := map[string]*[]PolicyRule{}
	for name, p := range v.Packs {
		if p.Rules == nil {
			packs[name] = nil
			continue
		}
		var rules []PolicyRule
		decodeStrict(t, p.Rules, &rules)
		packs[name] = &rules
	}

	for _, r := range v.Resolutions {
		pack := v.Packs[r.Pack]
		got := Wire(Resolve(ResolveInput{
			Rules:      packs[r.Pack],
			Country:    deref(r.Country),
			Region:     deref(r.Region),
			IABEnabled: pack.IABEnabled,
		}))
		if !sameJSON(t, got, r.Wire) {
			raw, _ := json.Marshal(got)
			t.Errorf("%s at %v/%v\n got %s\nwant %s", r.Pack, deref(r.Country), deref(r.Region), raw, r.Wire)
		}
	}
}

func TestSafeFallbackMatchesReference(t *testing.T) {
	v := loadResolutionVectors(t).Fallback
	rule, fingerprints := SafeFallback()
	if !sameJSON(t, rule, v.Rule) {
		t.Error("safe fallback rule differs from the reference")
	}
	if fingerprints != v.Fingerprints {
		t.Errorf("safe fallback fingerprints %+v, want %+v", fingerprints, v.Fingerprints)
	}
	computed, err := RuleFingerprints(rule, nil)
	if err != nil {
		t.Fatal(err)
	}
	if computed != fingerprints {
		t.Errorf("safe fallback constants %+v differ from its hash %+v", fingerprints, computed)
	}
}

func TestParseContractHeaderMatchesReference(t *testing.T) {
	for _, h := range loadResolutionVectors(t).Headers {
		got, ok := ParseContractHeader(deref(h.Value))
		if h.Parsed == nil {
			if ok {
				t.Errorf("ParseContractHeader(%q) = %d, want none", deref(h.Value), got)
			}
			continue
		}
		if !ok || got != *h.Parsed {
			t.Errorf("ParseContractHeader(%q) = %d, %v, want %d", deref(h.Value), got, ok, *h.Parsed)
		}
	}
}

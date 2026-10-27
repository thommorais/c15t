package policyrule

import (
	"encoding/json"
	"testing"
)

func TestPresetsMatchReference(t *testing.T) {
	type vector struct {
		resolved     json.RawMessage
		fingerprints Fingerprints
	}
	byName := map[string]vector{}
	for _, v := range loadRuleVectors(t).Normalized {
		byName[v.Name] = vector{v.Resolved, v.Fingerprints}
	}

	names := PresetNames()
	if len(names) == 0 {
		t.Fatal("no presets embedded")
	}
	for _, name := range names {
		want, ok := byName[name]
		if !ok {
			t.Errorf("%s: no reference vector", name)
			continue
		}
		rule, _ := Preset(name)
		resolved, err := Normalize(rule)
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if !sameJSON(t, resolved, want.resolved) {
			t.Errorf("%s: resolved differs from the reference", name)
		}
		fingerprints, err := RuleFingerprints(resolved, rule.LegacyMaterial)
		if err != nil {
			t.Fatal(err)
		}
		if fingerprints != want.fingerprints {
			t.Errorf("%s: fingerprints\n got %+v\nwant %+v", name, fingerprints, want.fingerprints)
		}
	}
}

func TestPresetReportsUnknownName(t *testing.T) {
	if _, ok := Preset("atlantisOptIn"); ok {
		t.Error("Preset found a preset that does not exist")
	}
}

func TestRecommendedRulesFormAValidPack(t *testing.T) {
	for _, iab := range []bool{false, true} {
		rules := RecommendedRules(iab)
		if len(rules) == 0 {
			t.Fatalf("RecommendedRules(%v) is empty", iab)
		}
		if got := Inspect(rules, &InspectOptions{IABEnabled: iab}); len(got.Errors) > 0 {
			t.Errorf("RecommendedRules(%v): %q", iab, got.Errors)
		}
		for _, r := range rules {
			if _, err := Normalize(r); err != nil {
				t.Errorf("RecommendedRules(%v): %v", iab, err)
			}
		}
	}
}

func TestRecommendedRulesUseTheIABPresetOnlyWhenAsked(t *testing.T) {
	ids := func(rules []PolicyRule) []string {
		var out []string
		for _, r := range rules {
			out = append(out, r.ID)
		}
		return out
	}
	without, with := ids(RecommendedRules(false)), ids(RecommendedRules(true))
	if without[0] != "europe_opt_in" || with[0] != "europe_iab" {
		t.Errorf("first rules: %v and %v", without, with)
	}
}

func TestPresetReturnsACopy(t *testing.T) {
	rule, _ := Preset("europeOptIn")
	rule.Match.Countries[0] = "XX"
	again, _ := Preset("europeOptIn")
	if again.Match.Countries[0] == "XX" {
		t.Error("changing a returned preset changed the embedded one")
	}
}

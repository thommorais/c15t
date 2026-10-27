package policyrule

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type ruleVectors struct {
	Normalized []struct {
		Name         string          `json:"name"`
		Rule         json.RawMessage `json:"rule"`
		Resolved     json.RawMessage `json:"resolved"`
		Fingerprints Fingerprints    `json:"fingerprints"`
	} `json:"normalized"`
	Inspected []struct {
		Rule     json.RawMessage `json:"rule"`
		Errors   []string        `json:"errors"`
		Warnings []string        `json:"warnings"`
	} `json:"inspected"`
	Packs []struct {
		Rules    json.RawMessage `json:"rules"`
		Options  *InspectOptions `json:"options"`
		Errors   []string        `json:"errors"`
		Warnings []string        `json:"warnings"`
	} `json:"packs"`
}

func loadRuleVectors(t *testing.T) ruleVectors {
	t.Helper()
	raw, err := os.ReadFile("testdata/rules.json")
	if err != nil {
		t.Fatal(err)
	}
	var v ruleVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func decodeStrict(t *testing.T, raw json.RawMessage, into any) {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
}

func sameJSON(t *testing.T, got any, want json.RawMessage) bool {
	t.Helper()
	raw, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	var g, w any
	if err := json.Unmarshal(raw, &g); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(want, &w); err != nil {
		t.Fatal(err)
	}
	return reflect.DeepEqual(g, w)
}

func orEmpty(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func TestNormalizeMatchesReference(t *testing.T) {
	for _, v := range loadRuleVectors(t).Normalized {
		var rule PolicyRule
		decodeStrict(t, v.Rule, &rule)

		resolved, err := Normalize(rule)
		if err != nil {
			t.Errorf("%s: Normalize: %v", v.Name, err)
			continue
		}
		if !sameJSON(t, resolved, v.Resolved) {
			got, _ := json.Marshal(resolved)
			t.Errorf("%s: resolved\n got %s\nwant %s", v.Name, got, v.Resolved)
		}

		fingerprints, err := RuleFingerprints(resolved, rule.LegacyMaterial)
		if err != nil {
			t.Fatalf("%s: RuleFingerprints: %v", v.Name, err)
		}
		if fingerprints != v.Fingerprints {
			t.Errorf("%s: fingerprints\n got %+v\nwant %+v", v.Name, fingerprints, v.Fingerprints)
		}
	}
}

func TestInspectRuleMatchesReference(t *testing.T) {
	for _, v := range loadRuleVectors(t).Inspected {
		var rule PolicyRule
		decodeStrict(t, v.Rule, &rule)

		got := Inspect([]PolicyRule{rule}, nil)
		if !reflect.DeepEqual(orEmpty(got.Errors), orEmpty(v.Errors)) {
			t.Errorf("%s: errors\n got %q\nwant %q", v.Rule, got.Errors, v.Errors)
		}
		if !reflect.DeepEqual(orEmpty(got.Warnings), orEmpty(v.Warnings)) {
			t.Errorf("%s: warnings\n got %q\nwant %q", v.Rule, got.Warnings, v.Warnings)
		}
		if _, err := Normalize(rule); err == nil {
			t.Errorf("%s: Normalize accepted an invalid rule", v.Rule)
		} else if err.Error() != v.Errors[0] {
			t.Errorf("%s: Normalize error %q, want %q", v.Rule, err, v.Errors[0])
		}
	}
}

func TestInspectPackMatchesReference(t *testing.T) {
	for _, v := range loadRuleVectors(t).Packs {
		var rules []PolicyRule
		decodeStrict(t, v.Rules, &rules)

		got := Inspect(rules, v.Options)
		if !reflect.DeepEqual(orEmpty(got.Errors), orEmpty(v.Errors)) {
			t.Errorf("pack %s: errors\n got %q\nwant %q", v.Rules, got.Errors, v.Errors)
		}
		if !reflect.DeepEqual(orEmpty(got.Warnings), orEmpty(v.Warnings)) {
			t.Errorf("pack %.200s: warnings\n got %q\nwant %q", v.Rules, got.Warnings, v.Warnings)
		}
	}
}

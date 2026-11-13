package consent

import (
	"testing"
	"time"
)

func decision(value bool, at int64) CategoryDecision {
	return CategoryDecision{Value: &value, ConfirmedAt: &at, Basis: ChoiceBasis{Kind: "choice-v1", Fingerprint: "policy"}}
}

func TestChoiceMergeKeepsDenialsAndUntouchedConfirmationTimes(t *testing.T) {
	rows := []ChoiceRow{
		{GivenAt: time.UnixMilli(200), Choice: &Choice{Version: 3, Categories: map[string]CategoryDecision{"marketing": decision(false, 200)}}},
		{GivenAt: time.UnixMilli(100), Choice: &Choice{Version: 3, Categories: map[string]CategoryDecision{"marketing": decision(true, 100), "measurement": decision(true, 100)}}},
	}
	got := MergeChoice(rows)
	if *got.Categories["marketing"].Value || *got.Categories["measurement"].ConfirmedAt != 100 {
		t.Fatal(got)
	}
	// An older offline act arriving last cannot replace a newer denial.
	rows = append(rows, ChoiceRow{GivenAt: time.UnixMilli(300), Choice: &Choice{Version: 3, Categories: map[string]CategoryDecision{"marketing": decision(true, 150)}}})
	if *MergeChoice(rows).Categories["marketing"].Value {
		t.Fatal("offline replay replaced a newer denial")
	}
	// Legacy snapshots prove only their grants. They do not create refusals,
	// renew other categories, or remove explicit denials.
	rows = append(rows, ChoiceRow{GivenAt: time.UnixMilli(400), Granted: []string{"functionality"}})
	got = MergeChoice(rows)
	if _, ok := got.Categories["measurement"]; ok {
		t.Fatal("legacy omission renewed a grant")
	}
	if *got.Categories["marketing"].Value || got.Categories["functionality"].Basis.Kind != "legacy-v2" {
		t.Fatal(got)
	}
}

func TestChoiceRejectsMalformedOrFutureReceipts(t *testing.T) {
	now := time.UnixMilli(1000)
	for name, choice := range map[string]*Choice{
		"version":            {Version: 2, Categories: map[string]CategoryDecision{}},
		"missing categories": {Version: 3},
		"missing value":      {Version: 3, Categories: map[string]CategoryDecision{"marketing": {}}},
		"unknown category":   {Version: 3, Categories: map[string]CategoryDecision{"unknown": decision(true, 100)}},
		"future":             {Version: 3, Categories: map[string]CategoryDecision{"marketing": decision(true, 1001)}},
		"wrong policy":       {Version: 3, Categories: map[string]CategoryDecision{"marketing": decision(true, 100)}},
	} {
		t.Run(name, func(t *testing.T) {
			if choice.Validate(now, "other") == nil {
				t.Fatal("accepted invalid receipts")
			}
		})
	}
	if err := (&Choice{Version: 3, Categories: map[string]CategoryDecision{}}).Validate(now, "policy"); err != nil {
		t.Fatal("empty partial confirmation must be valid", err)
	}
}

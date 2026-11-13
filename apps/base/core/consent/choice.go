package consent

import (
	"fmt"
	"slices"
	"time"
)

type ChoiceBasis struct {
	Kind                string `json:"kind"`
	Fingerprint         string `json:"fingerprint,omitempty"`
	MaterialFingerprint string `json:"materialFingerprint,omitempty"`
}

type CategoryDecision struct {
	Value       *bool       `json:"value"`
	ConfirmedAt *int64      `json:"confirmedAt"`
	Basis       ChoiceBasis `json:"basis"`
}

type Choice struct {
	Version    int                         `json:"version"`
	Categories map[string]CategoryDecision `json:"categories"`
}

var optionalCategories = []string{"experience", "functionality", "marketing", "measurement"}

func (c *Choice) Validate(now time.Time, fingerprint string) error {
	if c == nil {
		return nil
	}
	if c.Version != 3 || c.Categories == nil {
		return fmt.Errorf("%w: invalid choice version or categories", ErrInvalid)
	}
	for category, receipt := range c.Categories {
		if !slices.Contains(optionalCategories, category) || receipt.Value == nil || receipt.ConfirmedAt == nil || *receipt.ConfirmedAt < 0 || *receipt.ConfirmedAt > now.UnixMilli() {
			return fmt.Errorf("%w: invalid receipt for %q", ErrInvalid, category)
		}
		switch receipt.Basis.Kind {
		case "choice-v1":
			if receipt.Basis.Fingerprint == "" || (fingerprint != "" && receipt.Basis.Fingerprint != fingerprint) {
				return fmt.Errorf("%w: receipt policy basis does not match", ErrInvalid)
			}
		case "legacy-v2":
		default:
			return fmt.Errorf("%w: invalid receipt basis", ErrInvalid)
		}
	}
	return nil
}

// Granted returns only the grants this act confirmed. A partial receipt is
// never treated as a complete snapshot of the subject's choices.
func (c *Choice) Granted() []string {
	values := []string{"necessary"}
	for _, category := range optionalCategories {
		if r, ok := c.Categories[category]; ok && r.Value != nil && *r.Value {
			values = append(values, category)
		}
	}
	return values
}

type ChoiceRow struct {
	Choice  *Choice
	GivenAt time.Time
	Granted []string
}

// MergeChoice preserves confirmation times and explicit denials. A legacy
// snapshot clears earlier grants it cannot prove, but creates no denials.
func MergeChoice(rows []ChoiceRow) *Choice {
	slices.SortStableFunc(rows, func(a, b ChoiceRow) int { return a.GivenAt.Compare(b.GivenAt) })
	categories := map[string]CategoryDecision{}
	for _, row := range rows {
		patch := row.Choice
		if patch == nil {
			for category, receipt := range categories {
				if *receipt.Value && *receipt.ConfirmedAt <= row.GivenAt.UnixMilli() {
					delete(categories, category)
				}
			}
			patch = &Choice{Version: 3, Categories: map[string]CategoryDecision{}}
			for _, category := range row.Granted {
				if slices.Contains(optionalCategories, category) {
					granted, at := true, row.GivenAt.UnixMilli()
					patch.Categories[category] = CategoryDecision{Value: &granted, ConfirmedAt: &at, Basis: ChoiceBasis{Kind: "legacy-v2"}}
				}
			}
		}
		for category, receipt := range patch.Categories {
			if previous, ok := categories[category]; !ok || *receipt.ConfirmedAt >= *previous.ConfirmedAt {
				categories[category] = receipt
			}
		}
	}
	if len(categories) == 0 {
		return nil
	}
	return &Choice{Version: 3, Categories: categories}
}

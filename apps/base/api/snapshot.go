package api

import (
	"encoding/json"
	"time"

	"thom/core/jurisdiction"
	"thom/core/policy"
	"thom/core/snapshot"
)

func (h *Handler) signSnapshot(
	tenantID string,
	loc jurisdiction.Location,
	code jurisdiction.Code,
	decision *policy.Decision,
	language string,
) (string, error) {
	if h.signer == nil {
		return "", nil
	}

	p := snapshot.Payload{
		TenantID:     tenantID,
		Subject:      decision.Policy.ID,
		PolicyID:     decision.Policy.ID,
		Fingerprint:  decision.Fingerprint,
		MatchedBy:    string(decision.MatchedBy),
		Country:      loc.CountryCode,
		Region:       loc.RegionCode,
		Jurisdiction: string(code),
		Language:     language,
		Model:        string(decision.Policy.Model),
	}

	if c := decision.Policy.Consent; c != nil {
		p.ExpiryDays = c.ExpiryDays
		p.ScopeMode = string(c.ScopeMode)
		p.Categories = c.Categories
		p.PreselectedCategories = c.PreselectedCategories
		p.GPC = c.GPC
	}

	if i18n := decision.Policy.I18n; i18n != nil {
		p.PolicyI18n = i18n
	}

	if ui := decision.Policy.UI; ui != nil {
		if ui.Mode != nil {
			p.UIMode = string(*ui.Mode)
		}
		if ui.Banner != nil {
			p.BannerUI = ui.Banner
		}
		if ui.Dialog != nil {
			p.DialogUI = ui.Dialog
		}
	}

	if proof := decision.Policy.Proof; proof != nil {
		p.ProofConfig = proof
	}

	return h.signer.Sign(p, time.Now().UTC())
}

// verifySnapshot returns the verified payload, or nil when the write should
// fall back to resolving the policy now. A token records what the user was
// shown, so a valid one is used even when the policy has since changed.
func (h *Handler) verifySnapshot(token, tenantID string) (*snapshot.Payload, error) {
	if h.signer == nil {
		return nil, nil
	}

	if token == "" && !h.cfg.SnapshotRequired {
		return nil, nil
	}

	payload, err := h.signer.Verify(token, tenantID, time.Now().UTC())
	if err != nil {
		if !h.cfg.SnapshotRequired {
			return nil, nil
		}
		return nil, snapshotFailure(err)
	}

	return payload, nil
}

// decisionFromSnapshot rebuilds the decision the user was shown from a verified
// token, so the write is judged and stored against it rather than against the
// policy resolved at write time.
func decisionFromSnapshot(p *snapshot.Payload) (jurisdiction.Location, jurisdiction.Code, *policy.Decision, error) {
	code := jurisdiction.Code(p.Jurisdiction)
	if !code.Valid() {
		return jurisdiction.Location{}, "", nil, Conflict(codeSnapshotInvalid, "Policy snapshot token is invalid")
	}

	resolved := policy.Resolved{ID: p.PolicyID, Model: policy.Model(p.Model)}

	if p.ScopeMode != "" || p.ExpiryDays != nil || p.Categories != nil || p.PreselectedCategories != nil || p.GPC != nil {
		resolved.Consent = &policy.ResolvedConsent{
			ExpiryDays:            p.ExpiryDays,
			ScopeMode:             policy.ScopeMode(p.ScopeMode),
			Categories:            p.Categories,
			PreselectedCategories: p.PreselectedCategories,
			GPC:                   p.GPC,
		}
	}

	var err error
	if resolved.I18n, err = reshape[policy.I18n](p.PolicyI18n); err != nil {
		return jurisdiction.Location{}, "", nil, snapshotFailure(err)
	}
	if resolved.Proof, err = reshape[policy.ProofConfig](p.ProofConfig); err != nil {
		return jurisdiction.Location{}, "", nil, snapshotFailure(err)
	}

	banner, err := reshape[policy.ResolvedUISurface](p.BannerUI)
	if err != nil {
		return jurisdiction.Location{}, "", nil, snapshotFailure(err)
	}
	dialog, err := reshape[policy.ResolvedUISurface](p.DialogUI)
	if err != nil {
		return jurisdiction.Location{}, "", nil, snapshotFailure(err)
	}
	if p.UIMode != "" || banner != nil || dialog != nil {
		ui := &policy.ResolvedUI{Banner: banner, Dialog: dialog}
		if p.UIMode != "" {
			mode := policy.UIMode(p.UIMode)
			ui.Mode = &mode
		}
		resolved.UI = ui
	}

	loc := jurisdiction.Location{CountryCode: p.Country, RegionCode: p.Region}
	decision := &policy.Decision{
		Policy:      resolved,
		MatchedBy:   policy.MatchedBy(p.MatchedBy),
		Fingerprint: p.Fingerprint,
	}

	return loc, code, decision, nil
}

// reshape converts a decoded token field back into its policy type.
func reshape[T any](v any) (*T, error) {
	if v == nil {
		return nil, nil
	}

	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}

	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func snapshotFailure(err error) error {
	reason, _ := snapshot.ReasonOf(err)
	switch reason {
	case snapshot.ReasonMissing:
		return Conflict(codeSnapshotRequired, "Policy snapshot token is required")
	case snapshot.ReasonExpired:
		return Conflict(codeSnapshotExpired, "Policy snapshot token has expired")
	default:
		return Conflict(codeSnapshotInvalid, "Policy snapshot token is invalid")
	}
}

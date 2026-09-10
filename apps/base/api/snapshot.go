package api

import (
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
		Model:        string(decision.Policy.Model),
	}

	if c := decision.Policy.Consent; c != nil {
		p.ExpiryDays = c.ExpiryDays
		p.ScopeMode = string(c.ScopeMode)
		p.Categories = c.Categories
		p.GPC = c.GPC
	}

	return h.signer.Sign(p, time.Now().UTC())
}

// verifySnapshot rejects a write whose token does not match the policy resolved
// for this request, so a client cannot consent against a policy that has since
// changed. Without a configured secret the check is skipped entirely.
func (h *Handler) verifySnapshot(token, tenantID string, decision *policy.Decision) error {
	if h.signer == nil {
		return nil
	}

	if token == "" && !h.cfg.SnapshotRequired {
		return nil
	}

	payload, err := h.signer.Verify(token, tenantID, time.Now().UTC())
	if err != nil {
		if !h.cfg.SnapshotRequired {
			return nil
		}
		return Conflict(err.Error())
	}

	if payload.Fingerprint != decision.Fingerprint {
		return Conflict("policy snapshot token no longer matches the active policy")
	}

	return nil
}

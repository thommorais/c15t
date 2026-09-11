package api

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
)

// requireLegalDocumentProof mirrors the reference: consenting to a legal
// document needs verifiable proof of which version was shown, either a snapshot
// token or an explicit policy reference.
func (h *Handler) requireLegalDocumentProof(policyType string, body consentRequest) error {
	if !consent.IsLegalDocumentType(policyType) {
		return nil
	}
	if h.signer != nil || body.PolicyID != "" || body.PolicyHash != "" {
		return nil
	}

	return Conflict("legal document consent requires policyId or policyHash when snapshot verification is disabled")
}

// resolvePolicyRecord uses an explicitly referenced policy when the caller names
// one, and otherwise falls back to the active policy for the type.
func (h *Handler) resolvePolicyRecord(
	db *scope,
	policyType string,
	body consentRequest,
) (*core.Record, error) {
	if body.PolicyID != "" {
		record, err := db.FindByID("consentPolicy", body.PolicyID)
		if err != nil || false {
			return nil, NotFound("policy not found")
		}
		if !record.GetBool("isActive") {
			return nil, BadRequest("policy is inactive")
		}
		return record, nil
	}

	if body.PolicyHash != "" {
		record, err := db.FindFirst("consentPolicy", "type = {:type} && hash = {:hash}", dbx.Params{"type": policyType, "hash": body.PolicyHash})
		if err != nil || record == nil {
			return nil, NotFound("policy not found")
		}
		if !record.GetBool("isActive") {
			return nil, BadRequest("policy is inactive")
		}
		return record, nil
	}

	return h.findOrCreatePolicy(db, policyType)
}

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
	app core.App,
	tenantID, policyType string,
	body consentRequest,
) (*core.Record, error) {
	if body.PolicyID != "" {
		record, err := app.FindRecordById("consentPolicy", body.PolicyID)
		if err != nil || record.GetString("tenantId") != tenantID {
			return nil, NotFound("policy not found")
		}
		if !record.GetBool("isActive") {
			return nil, BadRequest("policy is inactive")
		}
		return record, nil
	}

	if body.PolicyHash != "" {
		record, err := app.FindFirstRecordByFilter(
			"consentPolicy",
			"type = {:type} && hash = {:hash} && tenantId = {:tenant}",
			dbx.Params{"type": policyType, "hash": body.PolicyHash, "tenant": tenantID},
		)
		if err != nil || record == nil {
			return nil, NotFound("policy not found")
		}
		if !record.GetBool("isActive") {
			return nil, BadRequest("policy is inactive")
		}
		return record, nil
	}

	return h.findOrCreatePolicy(app, tenantID, policyType)
}

package api

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
	"thom/core/docsnapshot"
)

// requireLegalDocumentProof mirrors the reference: consenting to a legal
// document needs verifiable proof of which version was shown. With a snapshot
// secret configured the token is that proof and is checked separately; without
// one the caller has to name the release with a policy id or hash.
func (h *Handler) requireLegalDocumentProof(policyType string, body consentRequest) error {
	if !consent.IsLegalDocumentType(policyType) || h.docSigner != nil {
		return nil
	}
	if body.PolicyID != "" || body.PolicyHash != "" {
		return nil
	}

	return Conflict(codeProofRequired, "Legal document consent requires policyId or policyHash when snapshot verification is disabled")
}

// verifyDocumentSnapshot checks a legal-document token against the consent's
// type and returns the release it names.
func (h *Handler) verifyDocumentSnapshot(token, policyType, tenantID string) (*docsnapshot.Payload, time.Time, error) {
	payload, err := h.docSigner.Verify(token, tenantID, time.Now().UTC())
	if err != nil {
		return nil, time.Time{}, docSnapshotFailure(err)
	}

	effective, parseErr := time.Parse(time.RFC3339, payload.EffectiveDate)
	if payload.Type != policyType || parseErr != nil {
		return nil, time.Time{}, Conflict(codeDocSnapshotInvalid, "Legal document snapshot token is invalid")
	}

	return payload, effective, nil
}

func docSnapshotFailure(err error) error {
	reason, _ := docsnapshot.ReasonOf(err)
	switch reason {
	case docsnapshot.ReasonMissing:
		return Conflict(codeDocSnapshotRequired, "Legal document snapshot token is required")
	case docsnapshot.ReasonExpired:
		return Conflict(codeDocSnapshotExpired, "Legal document snapshot token has expired")
	default:
		return Conflict(codeDocSnapshotInvalid, "Legal document snapshot token is invalid")
	}
}

// findOrCreateLegalDocumentPolicy returns the stored release a token names,
// recording it as a historical (inactive) release when it has not been seen. It
// never promotes a release: the active one changes only by publishing.
func (h *Handler) findOrCreateLegalDocumentPolicy(
	db *scope,
	docType, version, hash string,
	effective time.Time,
) (*core.Record, error) {
	conflict := Conflict(codeReleaseConflict, "Release metadata conflicts with existing consent policy")

	matches := func(r *core.Record) bool {
		return r.GetString("version") == version && r.GetDateTime("effectiveDate").Time().Equal(effective)
	}

	byHash, err := db.FindFirst("consentPolicy", "type = {:type} && hash = {:hash}", dbx.Params{"type": docType, "hash": hash})
	if err != nil && !isMissing(err) {
		return nil, err
	}
	if byHash != nil {
		if !matches(byHash) {
			return nil, conflict
		}
		return byHash, nil
	}

	byVersion, err := db.FindFirst("consentPolicy", "type = {:type} && version = {:version}", dbx.Params{"type": docType, "version": version})
	if err != nil && !isMissing(err) {
		return nil, err
	}
	if byVersion != nil {
		return nil, conflict
	}

	record, err := db.New("consentPolicy")
	if err != nil {
		return nil, err
	}
	record.Set("type", docType)
	record.Set("version", version)
	record.Set("hash", hash)
	record.Set("effectiveDate", effective)
	record.Set("isActive", false)

	if err := db.Save(record); err != nil {
		concurrent, findErr := db.FindFirst("consentPolicy", "type = {:type} && hash = {:hash}", dbx.Params{"type": docType, "hash": hash})
		if findErr != nil || concurrent == nil {
			return nil, err
		}
		if !matches(concurrent) {
			return nil, conflict
		}
		return concurrent, nil
	}

	return record, nil
}

// resolvePolicyRecord uses an explicitly referenced policy when the caller names
// one, and otherwise falls back to the active policy for the type.
func (h *Handler) resolvePolicyRecord(
	db *scope,
	policyType string,
	body consentRequest,
) (*core.Record, error) {
	legal := consent.IsLegalDocumentType(policyType)

	if legal && body.PolicyID != "" {
		record, err := db.FindByID("consentPolicy", body.PolicyID)
		if err != nil {
			if isMissing(err) {
				return nil, NotFound(codePolicyNotFound, "Policy not found")
			}
			return nil, err
		}
		if !record.GetBool("isActive") {
			return nil, BadRequest(codePolicyInactive, "Policy is inactive")
		}
		return record, nil
	}

	if legal && body.PolicyHash != "" {
		record, err := db.FindFirst("consentPolicy", "type = {:type} && hash = {:hash}", dbx.Params{"type": policyType, "hash": body.PolicyHash})
		if err != nil && !isMissing(err) {
			return nil, err
		}
		if record == nil {
			return nil, NotFound(codePolicyNotFound, "Policy not found")
		}
		if !record.GetBool("isActive") {
			return nil, BadRequest(codePolicyInactive, "Policy is inactive")
		}
		return record, nil
	}

	return h.findOrCreatePolicy(db, policyType)
}

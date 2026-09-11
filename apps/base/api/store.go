package api

import (
	"errors"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
	"thom/core/jurisdiction"
	"thom/core/policy"
)

var (
	errInvalidInput = errors.New("invalid input")
	errNotOwned     = errors.New("record belongs to another tenant")
)

const initialPolicyVersion = "1.0.0"

func (h *Handler) findOrCreateSubject(db *scope, body consentRequest) (*core.Record, error) {
	if body.SubjectID != "" {
		record, err := db.FindByID("subject", body.SubjectID)
		if err != nil {
			return nil, errors.Join(errInvalidInput, errors.New("unknown subjectId"))
		}
		return record, nil
	}

	existing, err := db.FindFirst("subject", "externalId = {:ext}", dbx.Params{"ext": body.ExternalID})
	if err == nil && existing != nil {
		return existing, nil
	}

	record, err := db.New("subject")
	if err != nil {
		return nil, err
	}
	record.Set("externalId", body.ExternalID)

	if err := db.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) findOrCreateDomain(db *scope, name string) (*core.Record, error) {
	existing, err := db.FindFirst("domain", "name = {:name}", dbx.Params{"name": name})
	if err == nil && existing != nil {
		return existing, nil
	}

	record, err := db.New("domain")
	if err != nil {
		return nil, err
	}
	record.Set("name", name)

	if err := db.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) upsertDecision(
	db *scope,
	loc jurisdiction.Location,
	code jurisdiction.Code,
	decision *policy.Decision,
	policyType string,
	storedPolicy *core.Record,
) (*core.Record, error) {
	key := consent.DedupeKey(consent.DecisionKey{
		TenantID:     db.tenant,
		PolicyType:   policyType,
		Fingerprint:  decision.Fingerprint,
		MatchedBy:    string(decision.MatchedBy),
		CountryCode:  loc.CountryCode,
		RegionCode:   loc.RegionCode,
		Jurisdiction: string(code),
	})

	if existing, err := db.FindFirst(
		"runtimePolicyDecision",
		"dedupeKey = {:key}",
		dbx.Params{"key": key},
	); err == nil && existing != nil {
		return existing, nil
	}

	record, err := db.New("runtimePolicyDecision")
	if err != nil {
		return nil, err
	}

	record.Set("policy", storedPolicy.Id)
	record.Set("fingerprint", decision.Fingerprint)
	record.Set("matchedBy", string(decision.MatchedBy))
	record.Set("countryCode", loc.CountryCode)
	record.Set("regionCode", loc.RegionCode)
	record.Set("jurisdiction", string(code))
	record.Set("model", string(decision.Policy.Model))
	record.Set("dedupeKey", key)

	if c := decision.Policy.Consent; c != nil {
		record.Set("categories", c.Categories)
		record.Set("preselectedCategories", c.PreselectedCategories)
	}
	if ui := decision.Policy.UI; ui != nil {
		if ui.Mode != nil {
			record.Set("uiMode", string(*ui.Mode))
		}
		record.Set("bannerUi", ui.Banner)
		record.Set("dialogUi", ui.Dialog)
	}
	if p := decision.Policy.Proof; p != nil {
		record.Set("proofConfig", p)
	}
	if i18n := decision.Policy.I18n; i18n != nil {
		record.Set("policyI18n", i18n)
		if i18n.Language != nil {
			record.Set("language", *i18n.Language)
		}
	}

	if err := db.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) findOrCreatePolicy(db *scope, policyType string) (*core.Record, error) {
	existing, err := db.FindFirst(
		"consentPolicy",
		"type = {:type} && isActive = true",
		dbx.Params{"type": policyType},
	)
	if err == nil && existing != nil {
		return existing, nil
	}

	record, err := db.New("consentPolicy")
	if err != nil {
		return nil, err
	}

	record.Set("type", policyType)
	record.Set("version", initialPolicyVersion)
	record.Set("effectiveDate", nowUTC())
	record.Set("isActive", true)

	if err := db.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) insertConsent(
	db *scope,
	rec consent.Record,
	decision *core.Record,
	policyType string,
) (*core.Record, bool, error) {
	key := consent.SubmissionKey(consent.Submission{
		TenantID:   db.tenant,
		SubjectID:  rec.SubjectID,
		DomainID:   rec.DomainID,
		PolicyType: policyType,
		GivenAt:    rec.GivenAt,
	})

	if existing, err := db.FindFirst(
		"consent",
		"submissionKey = {:key}",
		dbx.Params{"key": key},
	); err == nil && existing != nil {
		return existing, true, nil
	}

	purposeIDs, err := h.resolvePurposes(db, rec.Categories)
	if err != nil {
		return nil, false, err
	}

	record, err := db.New("consent")
	if err != nil {
		return nil, false, err
	}

	record.Set("subject", rec.SubjectID)
	record.Set("domain", rec.DomainID)
	record.Set("policy", decision.GetString("policy"))
	record.Set("runtimePolicyDecision", decision.Id)
	record.Set("purposes", purposeIDs)
	record.Set("jurisdiction", rec.Jurisdiction)
	record.Set("jurisdictionModel", rec.JurisdictionModel)
	record.Set("ipAddress", rec.IPAddress)
	record.Set("userAgent", rec.UserAgent)
	record.Set("uiSource", string(rec.UISource))
	record.Set("consentAction", string(rec.Action))
	record.Set("tcString", rec.TCString)
	record.Set("givenAt", rec.GivenAt)
	record.Set("runtimePolicySource", "runtime")
	record.Set("submissionKey", key)

	if rec.Metadata != nil {
		record.Set("metadata", rec.Metadata)
	}
	if rec.ValidUntil != nil {
		record.Set("validUntil", *rec.ValidUntil)
	}

	if err := db.Save(record); err != nil {
		if existing, findErr := db.FindFirst(
			"consent",
			"submissionKey = {:key}",
			dbx.Params{"key": key},
		); findErr == nil && existing != nil {
			return existing, true, nil
		}
		return nil, false, err
	}

	return record, false, nil
}

func (h *Handler) resolvePurposes(db *scope, categories []string) ([]string, error) {
	ids := make([]string, 0, len(categories))

	for _, code := range categories {
		existing, err := db.FindFirst("consentPurpose", "code = {:code}", dbx.Params{"code": code})
		if err == nil && existing != nil {
			ids = append(ids, existing.Id)
			continue
		}

		record, err := db.New("consentPurpose")
		if err != nil {
			return nil, err
		}
		record.Set("code", code)

		if err := db.Save(record); err != nil {
			return nil, err
		}
		ids = append(ids, record.Id)
	}

	return ids, nil
}

func (h *Handler) appendAudit(db *scope, stored *core.Record, rec consent.Record) error {
	record, err := db.New("auditLog")
	if err != nil {
		return err
	}

	record.Set("entityType", "consent")
	record.Set("entityId", stored.Id)
	record.Set("actionType", "create")
	record.Set("subject", rec.SubjectID)
	record.Set("ipAddress", rec.IPAddress)
	record.Set("userAgent", rec.UserAgent)
	record.Set("changes", map[string]any{
		"categories": rec.Categories,
		"policyId":   rec.PolicyID,
		"action":     string(rec.Action),
	})

	return db.Save(record)
}

func nowUTC() time.Time {
	return time.Now().UTC()
}

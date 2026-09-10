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

var errInvalidInput = errors.New("invalid input")

const initialPolicyVersion = "1.0.0"

func (h *Handler) findOrCreateSubject(app core.App, tenantID string, body consentRequest) (*core.Record, error) {
	if body.SubjectID != "" {
		record, err := app.FindRecordById("subject", body.SubjectID)
		if err != nil {
			return nil, errors.Join(errInvalidInput, errors.New("unknown subjectId"))
		}
		if record.GetString("tenantId") != tenantID {
			return nil, errors.Join(errInvalidInput, errors.New("unknown subjectId"))
		}
		return record, nil
	}

	existing, err := app.FindFirstRecordByFilter(
		"subject",
		"externalId = {:ext} && tenantId = {:tenant}",
		dbx.Params{"ext": body.ExternalID, "tenant": tenantID},
	)
	if err == nil && existing != nil {
		return existing, nil
	}

	collection, err := app.FindCollectionByNameOrId("subject")
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(collection)
	record.Set("externalId", body.ExternalID)
	record.Set("tenantId", tenantID)

	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) findOrCreateDomain(app core.App, tenantID, name string) (*core.Record, error) {
	existing, err := app.FindFirstRecordByFilter(
		"domain",
		"name = {:name} && tenantId = {:tenant}",
		dbx.Params{"name": name, "tenant": tenantID},
	)
	if err == nil && existing != nil {
		return existing, nil
	}

	collection, err := app.FindCollectionByNameOrId("domain")
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(collection)
	record.Set("name", name)
	record.Set("tenantId", tenantID)

	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) upsertDecision(
	app core.App,
	tenantID string,
	loc jurisdiction.Location,
	code jurisdiction.Code,
	decision *policy.Decision,
	policyType string,
) (*core.Record, error) {
	key := consent.DedupeKey(consent.DecisionKey{
		TenantID:     tenantID,
		PolicyType:   policyType,
		Fingerprint:  decision.Fingerprint,
		MatchedBy:    string(decision.MatchedBy),
		CountryCode:  loc.CountryCode,
		RegionCode:   loc.RegionCode,
		Jurisdiction: string(code),
	})

	existing, err := app.FindFirstRecordByFilter(
		"runtimePolicyDecision",
		"dedupeKey = {:key}",
		dbx.Params{"key": key},
	)
	if err == nil && existing != nil {
		return existing, nil
	}

	storedPolicy, err := h.findOrCreatePolicy(app, tenantID, policyType)
	if err != nil {
		return nil, err
	}

	collection, err := app.FindCollectionByNameOrId("runtimePolicyDecision")
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(collection)
	record.Set("policy", storedPolicy.Id)
	record.Set("fingerprint", decision.Fingerprint)
	record.Set("matchedBy", string(decision.MatchedBy))
	record.Set("countryCode", loc.CountryCode)
	record.Set("regionCode", loc.RegionCode)
	record.Set("jurisdiction", string(code))
	record.Set("model", string(decision.Policy.Model))
	record.Set("dedupeKey", key)
	record.Set("tenantId", tenantID)

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

	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) findOrCreatePolicy(app core.App, tenantID, policyType string) (*core.Record, error) {
	existing, err := app.FindFirstRecordByFilter(
		"consentPolicy",
		"type = {:type} && isActive = true && tenantId = {:tenant}",
		dbx.Params{"type": policyType, "tenant": tenantID},
	)
	if err == nil && existing != nil {
		return existing, nil
	}

	collection, err := app.FindCollectionByNameOrId("consentPolicy")
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(collection)
	record.Set("type", policyType)
	record.Set("version", initialPolicyVersion)
	record.Set("effectiveDate", nowUTC())
	record.Set("isActive", true)
	record.Set("tenantId", tenantID)

	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) insertConsent(app core.App, rec consent.Record, decision *core.Record) (*core.Record, error) {
	purposeIDs, err := h.resolvePurposes(app, rec.TenantID, rec.Categories)
	if err != nil {
		return nil, err
	}

	collection, err := app.FindCollectionByNameOrId("consent")
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(collection)
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
	record.Set("tenantId", rec.TenantID)

	if rec.Metadata != nil {
		record.Set("metadata", rec.Metadata)
	}
	if rec.ValidUntil != nil {
		record.Set("validUntil", *rec.ValidUntil)
	}

	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func (h *Handler) resolvePurposes(app core.App, tenantID string, categories []string) ([]string, error) {
	ids := make([]string, 0, len(categories))

	collection, err := app.FindCollectionByNameOrId("consentPurpose")
	if err != nil {
		return nil, err
	}

	for _, code := range categories {
		existing, err := app.FindFirstRecordByFilter(
			"consentPurpose",
			"code = {:code} && tenantId = {:tenant}",
			dbx.Params{"code": code, "tenant": tenantID},
		)
		if err == nil && existing != nil {
			ids = append(ids, existing.Id)
			continue
		}

		record := core.NewRecord(collection)
		record.Set("code", code)
		record.Set("tenantId", tenantID)
		if err := app.Save(record); err != nil {
			return nil, err
		}
		ids = append(ids, record.Id)
	}

	return ids, nil
}

func (h *Handler) appendAudit(app core.App, tenantID string, stored *core.Record, rec consent.Record) error {
	collection, err := app.FindCollectionByNameOrId("auditLog")
	if err != nil {
		return err
	}

	record := core.NewRecord(collection)
	record.Set("entityType", "consent")
	record.Set("entityId", stored.Id)
	record.Set("actionType", "create")
	record.Set("subject", rec.SubjectID)
	record.Set("ipAddress", rec.IPAddress)
	record.Set("userAgent", rec.UserAgent)
	record.Set("tenantId", tenantID)
	record.Set("changes", map[string]any{
		"categories": rec.Categories,
		"policyId":   rec.PolicyID,
		"action":     string(rec.Action),
	})

	return app.Save(record)
}

func nowUTC() time.Time {
	return time.Now().UTC()
}

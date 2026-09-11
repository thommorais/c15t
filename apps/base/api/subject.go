package api

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
)

type subjectPayload struct {
	ID               string         `json:"id"`
	ExternalID       string         `json:"externalId,omitempty"`
	IdentityProvider string         `json:"identityProvider,omitempty"`
	CreatedAt        time.Time      `json:"createdAt"`
	UpdatedAt        time.Time      `json:"updatedAt"`
	Consents         []enrichedItem `json:"consents,omitempty"`
}

type enrichedItem struct {
	ID             string     `json:"id"`
	PolicyType     string     `json:"type"`
	PolicyID       string     `json:"policyId,omitempty"`
	PolicyVersion  string     `json:"policyVersion,omitempty"`
	IsLatestPolicy bool       `json:"isLatestPolicy"`
	GivenAt        time.Time  `json:"givenAt"`
	ValidUntil     *time.Time `json:"validUntil,omitempty"`
	Action         string     `json:"action,omitempty"`
}

func toSubject(r *core.Record) subjectPayload {
	return subjectPayload{
		ID:               r.Id,
		ExternalID:       r.GetString("externalId"),
		IdentityProvider: r.GetString("identityProvider"),
		CreatedAt:        r.GetDateTime("createdAt").Time(),
		UpdatedAt:        r.GetDateTime("updatedAt").Time(),
	}
}

func (h *Handler) getSubject(c *Ctx, _ any) (subjectPayload, error) {
	id := c.Path("id")
	if id == "" {
		return subjectPayload{}, BadRequest("subject id is required")
	}

	record, err := c.DB().FindByID("subject", id)
	if err != nil || record.GetString("tenantId") != c.TenantID() {
		return subjectPayload{}, NotFound("subject not found")
	}

	out := toSubject(record)

	consents, err := h.enrichConsents(c.DB(), record.Id)
	if err != nil {
		return subjectPayload{}, err
	}
	out.Consents = consents

	return out, nil
}

func (h *Handler) listSubjects(c *Ctx, _ any) (map[string]any, error) {
	externalID := c.Query("externalId")
	if externalID == "" {
		return nil, Unprocessable("externalId query parameter is required")
	}

	records, err := c.DB().FindAll("subject", "externalId = {:ext}", "-createdAt", 0, 0, dbx.Params{"ext": externalID})
	if err != nil {
		return nil, err
	}

	out := make([]subjectPayload, 0, len(records))
	for _, record := range records {
		item := toSubject(record)

		consents, err := h.enrichConsents(c.DB(), record.Id)
		if err != nil {
			return nil, err
		}
		item.Consents = consents

		out = append(out, item)
	}

	return map[string]any{"subjects": out}, nil
}

type patchSubjectRequest struct {
	ExternalID       string `json:"externalId"`
	IdentityProvider string `json:"identityProvider"`
}

func (h *Handler) patchSubject(c *Ctx, body patchSubjectRequest) (subjectPayload, error) {
	id := c.Path("id")
	if id == "" {
		return subjectPayload{}, BadRequest("subject id is required")
	}
	if body.ExternalID == "" {
		return subjectPayload{}, BadRequest("externalId is required")
	}

	provider := body.IdentityProvider
	if provider == "" {
		provider = "external"
	}

	record, err := c.DB().FindByID("subject", id)
	if err != nil || record.GetString("tenantId") != c.TenantID() {
		return subjectPayload{}, NotFound("subject not found")
	}

	before := map[string]any{
		"externalId":       record.GetString("externalId"),
		"identityProvider": record.GetString("identityProvider"),
	}

	err = c.DB().Tx(func(tx *scope) error {
		record.Set("externalId", body.ExternalID)
		record.Set("identityProvider", provider)

		if err := tx.Save(record); err != nil {
			return err
		}

		entry, err := tx.New("auditLog")
		if err != nil {
			return err
		}

		entry.Set("entityType", "subject")
		entry.Set("entityId", record.Id)
		entry.Set("actionType", "update")
		entry.Set("subject", record.Id)
		entry.Set("changes", map[string]any{
			"before": before,
			"after": map[string]any{
				"externalId":       body.ExternalID,
				"identityProvider": provider,
			},
		})

		return tx.Save(entry)
	})
	if err != nil {
		return subjectPayload{}, err
	}

	return toSubject(record), nil
}

// enrichConsents resolves each consent's policy type and whether that policy is
// still the active one, which is what tells a caller a re-prompt is due.
func (h *Handler) enrichConsents(db *scope, subjectID string) ([]enrichedItem, error) {
	records, err := db.FindAll("consent", "subject = {:subject}", "-givenAt", 0, 0, dbx.Params{"subject": subjectID})
	if err != nil {
		return nil, err
	}

	latestByType := map[string]string{}
	out := make([]enrichedItem, 0, len(records))

	for _, record := range records {
		item := enrichedItem{
			ID:         record.Id,
			PolicyType: consent.DefaultPolicyType,
			GivenAt:    record.GetDateTime("givenAt").Time(),
			ValidUntil: validUntilOf(record),
			Action:     record.GetString("consentAction"),
		}

		policyID := record.GetString("policy")
		if policyID != "" {
			if policyRecord, err := db.FindByID("consentPolicy", policyID); err == nil {
				item.PolicyID = policyID
				item.PolicyType = policyRecord.GetString("type")
				item.PolicyVersion = policyRecord.GetString("version")

				latest, cached := latestByType[item.PolicyType]
				if !cached {
					if active, err := db.FindFirst("consentPolicy", "type = {:type} && isActive = true", dbx.Params{"type": item.PolicyType}); err == nil && active != nil {
						latest = active.Id
					}
					latestByType[item.PolicyType] = latest
				}

				item.IsLatestPolicy = latest == policyID
			}
		}

		out = append(out, item)
	}

	return out, nil
}

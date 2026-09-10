package api

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
)

type legalDocumentRequest struct {
	Version       string     `json:"version"`
	Hash          string     `json:"hash"`
	EffectiveDate *time.Time `json:"effectiveDate"`
}

type legalDocumentPayload struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"`
	Version       string    `json:"version"`
	Hash          string    `json:"hash,omitempty"`
	EffectiveDate time.Time `json:"effectiveDate"`
	IsActive      bool      `json:"isActive"`
}

// syncLegalDocument publishes a document version and makes it the active one
// for its type, retiring the previous version.
func (h *Handler) syncLegalDocument(c *Ctx, body legalDocumentRequest) (map[string]any, error) {
	docType := c.Path("type")
	if !consent.ValidPolicyType(docType) {
		return nil, Unprocessable("unknown legal document type " + docType)
	}
	if body.Version == "" {
		return nil, Unprocessable("version is required")
	}
	if body.EffectiveDate == nil {
		return nil, Unprocessable("effectiveDate must be a valid ISO-8601 string")
	}

	var stored *core.Record

	err := h.app.RunInTransaction(func(txApp core.App) error {
		existing, err := txApp.FindFirstRecordByFilter(
			"consentPolicy",
			"type = {:type} && version = {:version} && tenantId = {:tenant}",
			dbx.Params{"type": docType, "version": body.Version, "tenant": c.Tenant.TenantID},
		)

		if err == nil && existing != nil {
			// Re-publishing a version must not silently change what it says.
			if hash := existing.GetString("hash"); hash != "" && body.Hash != "" && hash != body.Hash {
				return Conflict("version " + body.Version + " was already released with a different hash")
			}
			stored = existing
		}

		active, err := txApp.FindFirstRecordByFilter(
			"consentPolicy",
			"type = {:type} && isActive = true && tenantId = {:tenant}",
			dbx.Params{"type": docType, "tenant": c.Tenant.TenantID},
		)
		if err == nil && active != nil && (stored == nil || active.Id != stored.Id) {
			active.Set("isActive", false)
			if err := txApp.Save(active); err != nil {
				return err
			}
		}

		if stored != nil {
			stored.Set("isActive", true)
			stored.Set("effectiveDate", *body.EffectiveDate)
			if body.Hash != "" {
				stored.Set("hash", body.Hash)
			}
			return txApp.Save(stored)
		}

		collection, err := txApp.FindCollectionByNameOrId("consentPolicy")
		if err != nil {
			return err
		}

		stored = core.NewRecord(collection)
		stored.Set("type", docType)
		stored.Set("version", body.Version)
		stored.Set("hash", body.Hash)
		stored.Set("effectiveDate", *body.EffectiveDate)
		stored.Set("isActive", true)
		stored.Set("tenantId", c.Tenant.TenantID)

		return txApp.Save(stored)
	})
	if err != nil {
		return nil, err
	}

	return map[string]any{"policy": legalDocumentPayload{
		ID:            stored.Id,
		Type:          stored.GetString("type"),
		Version:       stored.GetString("version"),
		Hash:          stored.GetString("hash"),
		EffectiveDate: stored.GetDateTime("effectiveDate").Time(),
		IsActive:      stored.GetBool("isActive"),
	}}, nil
}

type statusPayload struct {
	Version   string        `json:"version"`
	Timestamp time.Time     `json:"timestamp"`
	Client    clientPayload `json:"client"`
}

type clientPayload struct {
	IP             string          `json:"ip,omitempty"`
	UserAgent      string          `json:"userAgent,omitempty"`
	AcceptLanguage string          `json:"acceptLanguage,omitempty"`
	Region         locationPayload `json:"region"`
}

func (h *Handler) status(c *Ctx, _ any) (statusPayload, error) {
	if _, err := h.app.FindFirstRecordByFilter("apiKey", "id != ''", nil); err != nil {
		return statusPayload{}, Unavailable("database health check failed", err)
	}

	loc := h.locationOf(c.Event.Request)

	return statusPayload{
		Version:   Version,
		Timestamp: time.Now().UTC(),
		Client: clientPayload{
			IP:             requestIP(c, h),
			UserAgent:      c.Event.Request.UserAgent(),
			AcceptLanguage: acceptLanguage(c.Event.Request),
			Region: locationPayload{
				CountryCode: loc.CountryCode,
				RegionCode:  loc.RegionCode,
			},
		},
	}, nil
}

package api

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
)

type legalDocumentRequest struct {
	Version       *string `json:"version"`
	Hash          *string `json:"hash"`
	EffectiveDate *string `json:"effectiveDate"`
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
		return nil, BadRequest(codeInputValidationFailed, "unknown legal document type "+docType)
	}
	if body.Version == nil || body.Hash == nil || body.EffectiveDate == nil {
		return nil, BadRequest(codeInputValidationFailed, "version, hash and effectiveDate are required")
	}
	if *body.Version == "" {
		return nil, Unprocessable(codeInputValidationFailed, "version is required")
	}
	effectiveDate, err := time.Parse(time.RFC3339, *body.EffectiveDate)
	if err != nil {
		return nil, Unprocessable(codeInputValidationFailed, "effectiveDate must be a valid ISO-8601 string")
	}
	version, hash := *body.Version, *body.Hash

	var stored *core.Record

	err = c.DB().Tx(func(db *scope) error {

		existing, err := db.FindFirst("consentPolicy", "type = {:type} && version = {:version}", dbx.Params{"type": docType, "version": version})

		if err == nil && existing != nil {
			// Re-publishing a version must not silently change what it says.
			if released := existing.GetString("hash"); released != "" && hash != "" && released != hash {
				return Conflict(codeReleaseConflict, "Version "+version+" was already released with a different hash")
			}
			stored = existing
		}

		active, err := db.FindFirst("consentPolicy", "type = {:type} && isActive = true", dbx.Params{"type": docType})
		if err == nil && active != nil && (stored == nil || active.Id != stored.Id) {
			active.Set("isActive", false)
			if err := db.Save(active); err != nil {
				return err
			}
		}

		if stored != nil {
			stored.Set("isActive", true)
			stored.Set("effectiveDate", effectiveDate)
			if hash != "" {
				stored.Set("hash", hash)
			}
			return db.Save(stored)
		}

		stored, err = db.New("consentPolicy")
		if err != nil {
			return err
		}

		stored.Set("type", docType)
		stored.Set("version", version)
		stored.Set("hash", hash)
		stored.Set("effectiveDate", effectiveDate)
		stored.Set("isActive", true)

		return db.Save(stored)
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
	if _, err := c.DB().FindFirst("apiKey", "id != ''", nil); err != nil {
		return statusPayload{}, Unavailable(codeServiceUnavailable, "Database health check failed", err)
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

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
	if !consent.IsLegalDocumentType(docType) {
		return nil, BadRequest(codeInputValidationFailed, "not a legal document type: "+docType)
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
		release, err := h.findOrCreateLegalDocumentPolicy(db, docType, version, hash, effectiveDate)
		if err != nil {
			return err
		}

		others, err := db.FindAll("consentPolicy", "type = {:type} && isActive = true && id != {:id}", "", 0, 0,
			dbx.Params{"type": docType, "id": release.Id})
		if err != nil {
			return err
		}
		for _, other := range others {
			other.Set("isActive", false)
			if err := db.Save(other); err != nil {
				return err
			}
		}

		if !release.GetBool("isActive") {
			release.Set("isActive", true)
			if err := db.Save(release); err != nil {
				return err
			}
		}

		stored = release
		return nil
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
	// Authentication has already read apiKey, so probing it proves nothing. These
	// are the tables a consent write depends on; an empty one is healthy.
	for _, collection := range []string{"subject", "consent", "consentPolicy"} {
		if _, err := c.DB().FindFirst(collection, "id != ''", nil); err != nil && !isMissing(err) {
			return statusPayload{}, Unavailable(codeServiceUnavailable, "Database health check failed", err)
		}
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

package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
	"thom/core/jurisdiction"
	"thom/core/policy"
	"thom/core/request"
)

type Handler struct {
	app core.App
	cfg Config
}

func Register(app core.App, se *core.ServeEvent, cfg Config) {
	h := &Handler{app: app, cfg: cfg}

	g := se.Router.Group("/api/c15t")
	g.GET("/init", h.handleInit)
	g.POST("/consent", h.handleConsent)
	g.GET("/consent/{subjectId}", h.handleListConsent)
}

type initResponse struct {
	Jurisdiction string           `json:"jurisdiction"`
	Location     locationPayload  `json:"location"`
	Policy       *policy.Resolved `json:"policy,omitempty"`
	Decision     *decisionPayload `json:"policyDecision,omitempty"`
}

type locationPayload struct {
	CountryCode string `json:"countryCode,omitempty"`
	RegionCode  string `json:"regionCode,omitempty"`
}

type decisionPayload struct {
	PolicyID     string `json:"policyId"`
	Fingerprint  string `json:"fingerprint"`
	MatchedBy    string `json:"matchedBy"`
	Jurisdiction string `json:"jurisdiction"`
}

func (h *Handler) handleInit(e *core.RequestEvent) error {
	tenant, err := authenticate(h.app, e.Request)
	if err != nil {
		return e.UnauthorizedError("invalid or missing api key", nil)
	}

	loc, code, decision, err := h.resolve(e.Request)
	if err != nil {
		return e.InternalServerError("policy resolution failed", err)
	}

	resp := initResponse{
		Jurisdiction: string(code),
		Location: locationPayload{
			CountryCode: loc.CountryCode,
			RegionCode:  loc.RegionCode,
		},
	}

	if decision != nil {
		resp.Policy = &decision.Policy
		resp.Decision = &decisionPayload{
			PolicyID:     decision.Policy.ID,
			Fingerprint:  decision.Fingerprint,
			MatchedBy:    string(decision.MatchedBy),
			Jurisdiction: string(code),
		}
	}

	touchKeyUsage(h.app, tenant.KeyID)

	return e.JSON(http.StatusOK, resp)
}

type consentRequest struct {
	SubjectID  string         `json:"subjectId"`
	ExternalID string         `json:"externalId"`
	Domain     string         `json:"domain"`
	Categories []string       `json:"categories"`
	UISource   string         `json:"uiSource"`
	Action     string         `json:"action"`
	TCString   string         `json:"tcString"`
	Metadata   map[string]any `json:"metadata"`
}

type consentResponse struct {
	ID         string     `json:"id"`
	SubjectID  string     `json:"subjectId"`
	PolicyID   string     `json:"policyId"`
	GivenAt    time.Time  `json:"givenAt"`
	ValidUntil *time.Time `json:"validUntil,omitempty"`
	Action     string     `json:"action,omitempty"`
}

func (h *Handler) handleConsent(e *core.RequestEvent) error {
	tenant, err := authenticate(h.app, e.Request)
	if err != nil {
		return e.UnauthorizedError("invalid or missing api key", nil)
	}

	var body consentRequest
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("malformed request body", err)
	}
	if body.Domain == "" {
		return e.BadRequestError("domain is required", nil)
	}
	if body.SubjectID == "" && body.ExternalID == "" {
		return e.BadRequestError("subjectId or externalId is required", nil)
	}

	loc, code, decision, err := h.resolve(e.Request)
	if err != nil {
		return e.InternalServerError("policy resolution failed", err)
	}
	if decision == nil {
		return e.BadRequestError("no policy applies to this request", nil)
	}

	var stored *core.Record

	err = h.app.RunInTransaction(func(txApp core.App) error {
		subject, err := h.findOrCreateSubject(txApp, tenant.TenantID, body)
		if err != nil {
			return err
		}

		domain, err := h.findOrCreateDomain(txApp, tenant.TenantID, body.Domain)
		if err != nil {
			return err
		}

		record, err := consent.Build(consent.Input{
			SubjectID:    subject.Id,
			DomainID:     domain.Id,
			TenantID:     tenant.TenantID,
			Categories:   body.Categories,
			Policy:       decision.Policy,
			Jurisdiction: code,
			IPAddress:    request.ClientIP(e.Request.Header, h.ipOptions()),
			UserAgent:    e.Request.UserAgent(),
			Language:     acceptLanguage(e.Request),
			UISource:     consent.UISource(body.UISource),
			Action:       consent.Action(body.Action),
			TCString:     body.TCString,
			Metadata:     body.Metadata,
			GPCSignal:    hasGPCSignal(e.Request),
		})
		if err != nil {
			return err
		}

		rpd, err := h.upsertDecision(txApp, tenant.TenantID, loc, code, decision)
		if err != nil {
			return err
		}

		stored, err = h.insertConsent(txApp, record, rpd)
		if err != nil {
			return err
		}

		return h.appendAudit(txApp, tenant.TenantID, stored, record)
	})

	if err != nil {
		if consent.IsInvalid(err) || errors.Is(err, errInvalidInput) {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.InternalServerError("failed to record consent", err)
	}

	touchKeyUsage(h.app, tenant.KeyID)

	var validUntil *time.Time
	if v := stored.GetDateTime("validUntil"); !v.IsZero() {
		t := v.Time()
		validUntil = &t
	}

	return e.JSON(http.StatusCreated, consentResponse{
		ID:         stored.Id,
		SubjectID:  stored.GetString("subject"),
		PolicyID:   decision.Policy.ID,
		GivenAt:    stored.GetDateTime("givenAt").Time(),
		ValidUntil: validUntil,
		Action:     stored.GetString("consentAction"),
	})
}

func (h *Handler) handleListConsent(e *core.RequestEvent) error {
	tenant, err := authenticate(h.app, e.Request)
	if err != nil {
		return e.UnauthorizedError("invalid or missing api key", nil)
	}

	subjectID := e.Request.PathValue("subjectId")
	if subjectID == "" {
		return e.BadRequestError("subjectId is required", nil)
	}

	records, err := h.app.FindRecordsByFilter(
		"consent",
		"subject = {:subject} && tenantId = {:tenant}",
		"-givenAt",
		100,
		0,
		dbx.Params{"subject": subjectID, "tenant": tenant.TenantID},
	)
	if err != nil {
		return e.InternalServerError("failed to load consent", err)
	}

	out := make([]consentResponse, 0, len(records))
	for _, r := range records {
		var validUntil *time.Time
		if v := r.GetDateTime("validUntil"); !v.IsZero() {
			t := v.Time()
			validUntil = &t
		}

		out = append(out, consentResponse{
			ID:         r.Id,
			SubjectID:  r.GetString("subject"),
			PolicyID:   r.GetString("policy"),
			GivenAt:    r.GetDateTime("givenAt").Time(),
			ValidUntil: validUntil,
			Action:     r.GetString("consentAction"),
		})
	}

	touchKeyUsage(h.app, tenant.KeyID)

	return e.JSON(http.StatusOK, map[string]any{"consents": out})
}

func (h *Handler) resolve(r *http.Request) (jurisdiction.Location, jurisdiction.Code, *policy.Decision, error) {
	loc := jurisdiction.LocationFromHeaders(r.Header)
	if h.cfg.GeoDisabled {
		loc = jurisdiction.Location{}
	}

	code := jurisdiction.Resolve(loc, h.cfg.GeoDisabled)

	req := policy.Request{
		Policies:   h.cfg.PolicyPacks,
		IABEnabled: h.cfg.IABEnabled,
	}
	if loc.CountryCode != "" {
		req.CountryCode = &loc.CountryCode
	}
	if loc.RegionCode != "" {
		req.RegionCode = &loc.RegionCode
	}

	decision, err := policy.Resolve(req)
	return loc, code, decision, err
}

func (h *Handler) ipOptions() request.IPOptions {
	return request.IPOptions{
		DisableTracking: h.cfg.TrackIPDisabled,
		DisableMasking:  h.cfg.MaskIPDisabled,
	}
}

func hasGPCSignal(r *http.Request) bool {
	return r.Header.Get("Sec-GPC") == "1"
}

func acceptLanguage(r *http.Request) string {
	return r.Header.Get("Accept-Language")
}

package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
	"thom/core/jurisdiction"
	"thom/core/policy"
	"thom/core/request"
	"thom/core/snapshot"
)

type Handler struct {
	app    core.App
	cfg    Config
	signer *snapshot.Signer
}

func Register(app core.App, se *core.ServeEvent, cfg Config) {
	h := &Handler{app: app, cfg: cfg}
	if cfg.SnapshotSecret != "" {
		h.signer = snapshot.NewSigner(
			cfg.SnapshotSecret,
			cfg.SnapshotIssuer,
			cfg.SnapshotAudience,
			cfg.SnapshotTTL,
		)
	}

	g := se.Router.Group("/api/c15t")
	g.GET("/init", handle(h, h.init))
	g.POST("/consent", handle(h, h.recordConsent))
	g.GET("/consent/{subjectId}", handle(h, h.listConsent))
	g.GET("/consents/check", handle(h, h.checkConsent))
}

type initResponse struct {
	Jurisdiction  string           `json:"jurisdiction"`
	Location      locationPayload  `json:"location"`
	Policy        *policy.Resolved `json:"policy,omitempty"`
	Decision      *decisionPayload `json:"policyDecision,omitempty"`
	SnapshotToken string           `json:"policySnapshotToken,omitempty"`
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

func (h *Handler) init(c *Ctx, _ any) (initResponse, error) {
	loc, code, decision, err := h.resolve(c.Event.Request)
	if err != nil {
		return initResponse{}, err
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

		token, err := h.signSnapshot(c.Tenant.TenantID, loc, code, decision)
		if err != nil {
			return initResponse{}, err
		}
		resp.SnapshotToken = token
	}

	return resp, nil
}

type consentRequest struct {
	SubjectID     string         `json:"subjectId"`
	ExternalID    string         `json:"externalId"`
	Domain        string         `json:"domain"`
	Categories    []string       `json:"categories"`
	PolicyType    string         `json:"policyType"`
	UISource      string         `json:"uiSource"`
	Action        string         `json:"action"`
	TCString      string         `json:"tcString"`
	GivenAt       *time.Time     `json:"givenAt"`
	SnapshotToken string         `json:"policySnapshotToken"`
	Metadata      map[string]any `json:"metadata"`
}

type consentResponse struct {
	ID         string     `json:"id"`
	SubjectID  string     `json:"subjectId"`
	PolicyID   string     `json:"policyId"`
	GivenAt    time.Time  `json:"givenAt"`
	ValidUntil *time.Time `json:"validUntil,omitempty"`
	Action     string     `json:"action,omitempty"`
	Duplicate  bool       `json:"duplicate,omitempty"`
}

func (h *Handler) recordConsent(c *Ctx, body consentRequest) (Status, error) {
	if body.Domain == "" {
		return Status{}, BadRequest("domain is required")
	}
	if body.SubjectID == "" && body.ExternalID == "" {
		return Status{}, BadRequest("subjectId or externalId is required")
	}

	policyType := body.PolicyType
	if policyType == "" {
		policyType = consent.DefaultPolicyType
	}
	if !consent.ValidPolicyType(policyType) {
		return Status{}, BadRequest("unknown policyType " + policyType)
	}

	loc, code, decision, err := h.resolve(c.Event.Request)
	if err != nil {
		return Status{}, err
	}
	if decision == nil {
		return Status{}, BadRequest("no policy applies to this request")
	}

	if err := h.verifySnapshot(body.SnapshotToken, c.Tenant.TenantID, decision); err != nil {
		return Status{}, err
	}

	givenAt := consent.ClampGivenAt(body.GivenAt, time.Now().UTC())

	var (
		stored    *core.Record
		duplicate bool
	)

	err = h.app.RunInTransaction(func(txApp core.App) error {
		subject, err := h.findOrCreateSubject(txApp, c.Tenant.TenantID, body)
		if err != nil {
			return err
		}

		domain, err := h.findOrCreateDomain(txApp, c.Tenant.TenantID, body.Domain)
		if err != nil {
			return err
		}

		record, err := consent.Build(consent.Input{
			SubjectID:    subject.Id,
			DomainID:     domain.Id,
			TenantID:     c.Tenant.TenantID,
			Categories:   body.Categories,
			Policy:       decision.Policy,
			Jurisdiction: code,
			IPAddress:    request.ClientIP(c.Event.Request.Header, h.ipOptions()),
			UserAgent:    c.Event.Request.UserAgent(),
			Language:     acceptLanguage(c.Event.Request),
			UISource:     consent.UISource(body.UISource),
			Action:       consent.Action(body.Action),
			TCString:     body.TCString,
			Metadata:     body.Metadata,
			GPCSignal:    hasGPCSignal(c.Event.Request),
			Now:          givenAt,
		})
		if err != nil {
			return err
		}

		rpd, err := h.upsertDecision(txApp, c.Tenant.TenantID, loc, code, decision, policyType)
		if err != nil {
			return err
		}

		stored, duplicate, err = h.insertConsent(txApp, record, rpd, policyType)
		if err != nil {
			return err
		}
		if duplicate {
			return nil
		}

		return h.appendAudit(txApp, c.Tenant.TenantID, stored, record)
	})
	if err != nil {
		return Status{}, err
	}

	resp := consentResponse{
		ID:         stored.Id,
		SubjectID:  stored.GetString("subject"),
		PolicyID:   decision.Policy.ID,
		GivenAt:    stored.GetDateTime("givenAt").Time(),
		ValidUntil: validUntilOf(stored),
		Action:     stored.GetString("consentAction"),
		Duplicate:  duplicate,
	}

	if duplicate {
		return Status{Code: http.StatusOK, Body: resp}, nil
	}

	return Status{Code: http.StatusCreated, Body: resp}, nil
}

func (h *Handler) listConsent(c *Ctx, _ any) (map[string]any, error) {
	subjectID := c.Path("subjectId")
	if subjectID == "" {
		return nil, BadRequest("subjectId is required")
	}

	records, err := h.app.FindRecordsByFilter(
		"consent",
		"subject = {:subject} && tenantId = {:tenant}",
		"-givenAt",
		100,
		0,
		dbx.Params{"subject": subjectID, "tenant": c.Tenant.TenantID},
	)
	if err != nil {
		return nil, err
	}

	out := make([]consentResponse, 0, len(records))
	for _, r := range records {
		out = append(out, consentResponse{
			ID:         r.Id,
			SubjectID:  r.GetString("subject"),
			PolicyID:   r.GetString("policy"),
			GivenAt:    r.GetDateTime("givenAt").Time(),
			ValidUntil: validUntilOf(r),
			Action:     r.GetString("consentAction"),
		})
	}

	return map[string]any{"consents": out}, nil
}

func validUntilOf(r *core.Record) *time.Time {
	v := r.GetDateTime("validUntil")
	if v.IsZero() {
		return nil
	}
	t := v.Time()
	return &t
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

type checkResult struct {
	HasConsent     bool `json:"hasConsent"`
	IsLatestPolicy bool `json:"isLatestPolicy"`
}

// checkConsent answers whether an external identity has already consented,
// before a banner is shown. It returns booleans only: no subject ids, no
// consent detail, so it stays safe to call from an unauthenticated surface.
func (h *Handler) checkConsent(c *Ctx, _ any) (map[string]any, error) {
	externalID := c.Query("externalId")
	if externalID == "" {
		return nil, Unprocessable("externalId query parameter is required")
	}

	rawTypes := c.Query("type")
	if rawTypes == "" {
		return nil, Unprocessable("type query parameter is required")
	}

	results := map[string]checkResult{}
	var types []string
	for _, t := range strings.Split(rawTypes, ",") {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if _, seen := results[t]; seen {
			continue
		}
		results[t] = checkResult{}
		types = append(types, t)
	}

	if len(types) == 0 {
		return nil, Unprocessable("type query parameter is required")
	}

	subjects, err := h.app.FindRecordsByFilter(
		"subject",
		"externalId = {:ext} && tenantId = {:tenant}",
		"",
		0,
		0,
		dbx.Params{"ext": externalID, "tenant": c.Tenant.TenantID},
	)
	if err != nil || len(subjects) == 0 {
		return map[string]any{"results": results}, nil
	}

	var consents []*core.Record
	for _, subject := range subjects {
		found, err := h.app.FindRecordsByFilter(
			"consent",
			"subject = {:subject} && tenantId = {:tenant}",
			"-givenAt",
			0,
			0,
			dbx.Params{"subject": subject.Id, "tenant": c.Tenant.TenantID},
		)
		if err != nil {
			return nil, err
		}
		consents = append(consents, found...)
	}

	latestByType := map[string]string{}
	for _, t := range types {
		latest, err := h.app.FindFirstRecordByFilter(
			"consentPolicy",
			"type = {:type} && isActive = true && tenantId = {:tenant}",
			dbx.Params{"type": t, "tenant": c.Tenant.TenantID},
		)
		if err == nil && latest != nil {
			latestByType[t] = latest.Id
		}
	}

	for _, record := range consents {
		policyID := record.GetString("policy")
		if policyID == "" {
			continue
		}

		policyRecord, err := h.app.FindRecordById("consentPolicy", policyID)
		if err != nil {
			continue
		}

		policyType := policyRecord.GetString("type")
		entry, wanted := results[policyType]
		if !wanted {
			continue
		}

		entry.HasConsent = true
		if latestByType[policyType] == policyID {
			entry.IsLatestPolicy = true
		}
		results[policyType] = entry
	}

	return map[string]any{"results": results}, nil
}

package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/apikey"
	"thom/core/consent"
	"thom/core/jurisdiction"
	"thom/core/policy"
	"thom/core/ratelimit"
	"thom/core/request"
	"thom/core/snapshot"
)

type Handler struct {
	app    core.App
	cfg    Config
	signer *snapshot.Signer

	checkLimiter *ratelimit.Limiter
	writeLimiter *ratelimit.Limiter
	readLimiter  *ratelimit.Limiter
}

// limiterFor picks the rule guarding an endpoint. The cross-device check is
// tightest because it answers questions about an arbitrary externalId.
func (h *Handler) limiterFor(method, path string) *ratelimit.Limiter {
	if strings.HasSuffix(path, "/consents/check") {
		return h.checkLimiter
	}
	if needsBody(method) {
		return h.writeLimiter
	}
	return h.readLimiter
}

func Register(app core.App, se *core.ServeEvent, cfg Config) {
	h := &Handler{
		app:          app,
		cfg:          cfg,
		checkLimiter: ratelimit.New(cfg.CheckRate),
		writeLimiter: ratelimit.New(cfg.WriteRate),
		readLimiter:  ratelimit.New(cfg.DefaultRate),
	}
	if cfg.SnapshotSecret != "" {
		h.signer = snapshot.NewSigner(
			cfg.SnapshotSecret,
			cfg.SnapshotIssuer,
			cfg.SnapshotAudience,
			cfg.SnapshotTTL,
		)
	}

	g := se.Router.Group("/api/c15t")
	g.GET("/init", handle(h, apikey.ScopePublishable, h.init))
	g.POST("/consent", handle(h, apikey.ScopePublishable, h.recordConsent))
	g.GET("/consent/{subjectId}", handle(h, apikey.ScopeSecret, h.listConsent))
	g.GET("/consents/check", handle(h, apikey.ScopePublishable, h.checkConsent))
	g.GET("/status", handle(h, apikey.ScopePublishable, h.status))
	g.GET("/subjects", handle(h, apikey.ScopeSecret, h.listSubjects))
	g.GET("/subjects/{id}", handle(h, apikey.ScopeSecret, h.getSubject))
	g.PATCH("/subjects/{id}", handle(h, apikey.ScopeSecret, h.patchSubject))
	g.PUT("/legal-documents/{type}/current", handle(h, apikey.ScopeSecret, h.syncLegalDocument))
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

		token, err := h.signSnapshot(c.TenantID(), loc, code, decision)
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
	PolicyID      string         `json:"policyId"`
	PolicyHash    string         `json:"policyHash"`
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

	if err := h.verifySnapshot(body.SnapshotToken, c.TenantID(), decision); err != nil {
		return Status{}, err
	}

	if err := h.requireLegalDocumentProof(policyType, body); err != nil {
		return Status{}, err
	}

	givenAt := consent.ClampGivenAt(body.GivenAt, time.Now().UTC())

	var (
		stored    *core.Record
		duplicate bool
	)

	err = c.DB().Tx(func(tx *scope) error {

		subject, err := h.findOrCreateSubject(tx, body)
		if err != nil {
			return err
		}

		domain, err := h.findOrCreateDomain(tx, body.Domain)
		if err != nil {
			return err
		}

		record, err := consent.Build(consent.Input{
			SubjectID:    subject.Id,
			DomainID:     domain.Id,
			TenantID:     c.TenantID(),
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

		policyRecord, err := h.resolvePolicyRecord(tx, policyType, body)
		if err != nil {
			return err
		}

		rpd, err := h.upsertDecision(tx, loc, code, decision, policyType, policyRecord)
		if err != nil {
			return err
		}

		stored, duplicate, err = h.insertConsent(tx, record, rpd, policyType)
		if err != nil {
			return err
		}
		if duplicate {
			return nil
		}

		return h.appendAudit(tx, stored, record)
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

	records, err := c.DB().FindAll("consent", "subject = {:subject}", "-givenAt", 100, 0, dbx.Params{"subject": subjectID})
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

const Version = "0.1.0"

func (h *Handler) locationOf(r *http.Request) jurisdiction.Location {
	if h.cfg.GeoDisabled {
		return jurisdiction.Location{}
	}
	return jurisdiction.LocationFromHeaders(r.Header)
}

func requestIP(c *Ctx, h *Handler) string {
	return request.ClientIP(c.Event.Request.Header, h.ipOptions())
}

func (h *Handler) resolve(r *http.Request) (jurisdiction.Location, jurisdiction.Code, *policy.Decision, error) {
	loc := h.locationOf(r)

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

	subjects, err := c.DB().FindAll("subject", "externalId = {:ext}", "", 0, 0, dbx.Params{"ext": externalID})
	if err != nil || len(subjects) == 0 {
		return map[string]any{"results": results}, nil
	}

	var consents []*core.Record
	for _, subject := range subjects {
		found, err := c.DB().FindAll("consent", "subject = {:subject}", "-givenAt", 0, 0, dbx.Params{"subject": subject.Id})
		if err != nil {
			return nil, err
		}
		consents = append(consents, found...)
	}

	latestByType := map[string]string{}
	for _, t := range types {
		latest, err := c.DB().FindFirst("consentPolicy", "type = {:type} && isActive = true", dbx.Params{"type": t})
		if err == nil && latest != nil {
			latestByType[t] = latest.Id
		}
	}

	for _, record := range consents {
		policyID := record.GetString("policy")
		if policyID == "" {
			continue
		}

		policyRecord, err := c.DB().FindByID("consentPolicy", policyID)
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

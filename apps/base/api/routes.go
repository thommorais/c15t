package api

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/apikey"
	"thom/core/consent"
	"thom/core/docsnapshot"
	"thom/core/i18n"
	"thom/core/jurisdiction"
	"thom/core/policy"
	"thom/core/policyrule"
	"thom/core/ratelimit"
	"thom/core/request"
	"thom/core/snapshot"
)

type Handler struct {
	app    core.App
	cfg    Config
	signer *snapshot.Signer

	docSigner *docsnapshot.Signer

	checkLimiter *ratelimit.Limiter
	writeLimiter *ratelimit.Limiter
	readLimiter  *ratelimit.Limiter

	// warned holds the i18n warning keys already logged, so a fallback hit on
	// every request is logged once per process.
	warned sync.Map
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

	if cfg.LegalDocSnapshotSecret != "" {
		h.docSigner = docsnapshot.NewSigner(
			cfg.LegalDocSnapshotSecret,
			cfg.LegalDocSnapshotIssuer,
			cfg.LegalDocSnapshotAudience,
			0,
		)
	}

	se.Router.Unbind(apis.DefaultActivityLoggerMiddlewareId)
	se.Router.Bind(requestLog())

	g := se.Router.Group("/api/c15t")
	g.GET("/spec.json", serveSpec)
	g.GET("/init", handle(h, apikey.ScopePublishable, h.init))
	g.POST("/consent", handle(h, apikey.ScopePublishable, h.recordConsent))
	g.GET("/consent/{subjectId}", handle(h, apikey.ScopeSecret, h.listConsent))
	g.GET("/consents/check", handle(h, apikey.ScopePublishable, h.checkConsent))
	g.GET("/status", handle(h, apikey.ScopePublishable, h.status))
	g.GET("/subjects", handle(h, apikey.ScopeSecret, h.listSubjects))
	g.DELETE("/subjects", handle(h, apikey.ScopeSecret, h.eraseSubject))
	g.GET("/subjects/{id}", handle(h, apikey.ScopeSecret, h.getSubject))
	g.GET("/subjects/{id}/record", handle(h, apikey.ScopePublishable, h.getSubjectRecord))
	g.PATCH("/subjects/{id}", handle(h, apikey.ScopePublishable, h.patchSubject))
	g.PUT("/legal-documents/{type}/current", handle(h, apikey.ScopeSecret, h.syncLegalDocument))
	g.Any("/{path...}", notFound)
}

type initResponse struct {
	Resolution     policyrule.WireResolution `json:"policyResolution"`
	Branding       string                    `json:"branding"`
	Hosting        string                    `json:"hosting"`
	Jurisdiction   string                    `json:"jurisdiction"`
	Location       locationPayload           `json:"location"`
	Policy         *policy.Resolved          `json:"policy,omitempty"`
	Decision       *decisionPayload          `json:"policyDecision,omitempty"`
	SnapshotToken  string                    `json:"policySnapshotToken,omitempty"`
	Translations   i18n.Result               `json:"translations"`
	PrivacySignals privacySignals            `json:"resolvedPrivacySignals"`
}

type locationPayload struct {
	CountryCode *string `json:"countryCode"`
	RegionCode  *string `json:"regionCode"`
}

type decisionPayload struct {
	PolicyID     string `json:"policyId"`
	Fingerprint  string `json:"fingerprint"`
	MatchedBy    string `json:"matchedBy"`
	Jurisdiction string `json:"jurisdiction"`
}

func (h *Handler) init(c *Ctx, _ any) (initResponse, error) {
	c.Event.Request = initRequest(c.Event.Request)
	loc, code, decision, err := h.resolve(c.Event.Request)
	if err != nil {
		return initResponse{}, err
	}

	resp := initResponse{
		Branding: "c15t", Hosting: "self-hosted",
		Jurisdiction:   string(code),
		PrivacySignals: privacySignals{GPC: gpcSignal(c.Event.Request)},
		Location: locationPayload{
			CountryCode: optionalString(loc.CountryCode),
			RegionCode:  optionalString(loc.RegionCode),
		},
	}
	c.Event.Response.Header().Set(policyrule.ContractHeader, "1")
	c.Event.Response.Header().Set("Cache-Control", "no-store")
	c.Event.Response.Header().Set("Access-Control-Expose-Headers", policyrule.ContractHeader)
	resolution := legacyResolution(decision)
	if decision != nil && decision.Resolution != nil {
		resolution = *decision.Resolution
	}
	resp.Resolution = policyrule.Wire(resolution)
	if raw := c.Event.Request.Header.Get(policyrule.ContractHeader); raw != "" {
		if version, valid := policyrule.ParseContractHeader(raw); !valid || version != policyrule.ContractVersion {
			resp.Resolution = policyrule.Wire(policyrule.Resolution{Status: policyrule.StatusFailed, Reason: policyrule.ReasonUnsupportedContract})
		}
	}

	if decision == nil {
		resp.Policy = noBannerPolicy()
	} else {
		resp.Policy = &decision.Policy
	}

	resp.Translations = h.translate(c.Event.Request, resp.Policy)

	if decision != nil {
		resp.Decision = &decisionPayload{
			PolicyID:     decision.Policy.ID,
			Fingerprint:  decision.Fingerprint,
			MatchedBy:    string(decision.MatchedBy),
			Jurisdiction: string(code),
		}

		if resp.Resolution.Status == policyrule.StatusMatched {
			token, err := h.signSnapshot(c.TenantID(), loc, code, decision, resp.Translations.Language, gpcSignal(c.Event.Request))
			if err != nil {
				return initResponse{}, err
			}
			resp.SnapshotToken = token
		}
	}

	return resp, nil
}

func (h *Handler) translate(r *http.Request, p *policy.Resolved) i18n.Result {
	var language, profile string
	if p != nil && p.I18n != nil {
		if p.I18n.Language != nil {
			language = *p.I18n.Language
		}
		if p.I18n.MessageProfile != nil {
			profile = *p.I18n.MessageProfile
		}
	}

	result, warnings := h.cfg.Messages.Resolve(acceptLanguage(r), language, profile)
	for _, w := range warnings {
		if _, seen := h.warned.LoadOrStore(w.Key, struct{}{}); !seen {
			h.app.Logger().Warn(w.Message)
		}
	}
	return result
}

// noBannerPolicy is what a client is told when no policy applies, so that
// "show nothing" is an explicit answer and not an absent field.
func noBannerPolicy() *policy.Resolved {
	mode := policy.UIModeNone
	return &policy.Resolved{
		ID:    "no_banner",
		Model: policy.ModelNone,
		UI:    &policy.ResolvedUI{Mode: &mode},
	}
}

type consentRequest struct {
	Choice          *consent.Choice `json:"choice"`
	ClientSubjectID string          `json:"clientSubjectId"`
	SubjectToken    string          `json:"subjectToken"`
	SubjectID       string          `json:"subjectId"`
	ExternalID      string          `json:"externalId"`
	Domain          string          `json:"domain"`
	Categories      []string        `json:"categories"`
	PolicyType      string          `json:"policyType"`
	PolicyID        string          `json:"policyId"`
	PolicyHash      string          `json:"policyHash"`
	UISource        string          `json:"uiSource"`
	Action          string          `json:"action"`
	TCString        string          `json:"tcString"`
	GivenAt         *time.Time      `json:"givenAt"`
	SnapshotToken   string          `json:"policySnapshotToken"`
	DocumentToken   string          `json:"documentSnapshotToken"`
	Metadata        map[string]any  `json:"metadata"`
}

// consentResponse names the stored policy record as policyId, the same id a
// request's policyId takes, and the configured pack that applied as packId.
type consentResponse struct {
	ID         string     `json:"id"`
	SubjectID  string     `json:"subjectId"`
	PolicyID   string     `json:"policyId"`
	PackID     string     `json:"packId,omitempty"`
	GivenAt    time.Time  `json:"givenAt"`
	ValidUntil *time.Time `json:"validUntil,omitempty"`
	Action     string     `json:"action,omitempty"`
	Duplicate  bool       `json:"duplicate,omitempty"`
}

func (h *Handler) recordConsent(c *Ctx, body consentRequest) (Status, error) {
	if body.Domain == "" {
		return Status{}, BadRequest(codeInputValidationFailed, "domain is required")
	}
	if body.GivenAt == nil {
		return Status{}, BadRequest(codeInputValidationFailed, "givenAt is required")
	}

	policyType := body.PolicyType
	if policyType == "" {
		policyType = consent.DefaultPolicyType
	}
	if !consent.ValidPolicyType(policyType) {
		return Status{}, BadRequest(codeInputValidationFailed, "unknown policyType "+policyType)
	}

	var (
		loc      jurisdiction.Location
		code     jurisdiction.Code
		decision *policy.Decision
		resolved policy.Resolved
		language string
		source   = sourceWriteTime
		err      error

		release   *docsnapshot.Payload
		effective time.Time
	)

	if consent.IsLegalDocumentType(policyType) {
		// Accepting a legal document is not a banner interaction: the cookie
		// policy neither judges it nor expires it, and no banner decision is
		// recorded as having been shown.
		loc = h.locationOf(c.Event.Request)
		code = jurisdiction.Resolve(loc, h.cfg.GeoDisabled)

		if h.docSigner != nil {
			release, effective, err = h.verifyDocumentSnapshot(body.DocumentToken, policyType, c.TenantID())
			if err != nil {
				return Status{}, err
			}
		}
	} else {
		var shown *snapshot.Payload
		if shown, err = h.verifySnapshot(body.SnapshotToken, c.TenantID()); err != nil {
			return Status{}, err
		}

		if shown != nil {
			source = sourceSnapshot
			loc, code, decision, err = decisionFromSnapshot(shown)
		} else {
			loc, code, decision, err = h.resolve(c.Event.Request)
		}
		if err != nil {
			return Status{}, err
		}
		if decision == nil {
			return Status{}, BadRequest(codePolicyResolution, "No policy applies to this request")
		}

		resolved = decision.Policy

		// The language the visitor was shown: the token's when there is one,
		// else what init would have chosen for this request.
		language = h.translate(c.Event.Request, &resolved).Language
		if shown != nil && shown.Language != "" {
			language = shown.Language
		}
	}

	if err := h.requireLegalDocumentProof(policyType, body); err != nil {
		return Status{}, err
	}

	givenAt := consent.ClampGivenAt(body.GivenAt, time.Now().UTC())

	claimedAt := *body.GivenAt
	if body.Choice != nil {
		fingerprint := ""
		if decision != nil && decision.Resolution != nil && decision.Resolution.Fingerprints != nil {
			fingerprint = decision.Resolution.Fingerprints.Choice
		}
		if err := body.Choice.Validate(time.Now().UTC(), fingerprint); err != nil {
			return Status{}, err
		}
		if consent.IsLegalDocumentType(policyType) {
			return Status{}, BadRequest(codeInputValidationFailed, "Category receipts require cookie_banner")
		}
		body.Categories = body.Choice.Granted()
	}

	var (
		stored    *core.Record
		duplicate bool
	)

	err = c.DB().Tx(func(tx *scope) error {

		subject, err := h.findOrCreateSubject(tx, body)
		if err != nil {
			return err
		}
		if err := requireSubjectProof(c, subject, body.SubjectToken, false); err != nil {
			return err
		}

		domain, err := h.findOrCreateDomain(tx, body.Domain)
		if err != nil {
			return err
		}

		record, err := consent.Build(consent.Input{
			Choice:       body.Choice,
			SubjectID:    subject.Id,
			DomainID:     domain.Id,
			TenantID:     c.TenantID(),
			Categories:   body.Categories,
			Policy:       resolved,
			Jurisdiction: code,
			IPAddress:    storedIf(resolved.Proof.StoresIP(), request.ClientIP(c.Event.Request.Header, h.ipOptions(c.Event.Request))),
			UserAgent:    storedIf(resolved.Proof.StoresUserAgent(), c.Event.Request.UserAgent()),
			Language:     storedIf(resolved.Proof.StoresLanguage(), language),
			UISource:     consent.UISource(body.UISource),
			Action:       consent.Action(body.Action),
			TCString:     body.TCString,
			Metadata:     body.Metadata,
			GPCSignal:    hasGPCSignal(c.Event.Request),
			Now:          givenAt,
			ClaimedAt:    claimedAt,
		})
		if err != nil {
			return err
		}

		var policyRecord *core.Record
		if release != nil {
			policyRecord, err = h.findOrCreateLegalDocumentPolicy(tx, policyType, release.Version, release.Hash, effective)
		} else {
			policyRecord, err = h.resolvePolicyRecord(tx, policyType, body)
		}
		if err != nil {
			return err
		}

		var rpd *core.Record
		if decision != nil {
			rpd, err = h.upsertDecision(tx, loc, code, decision, policyType, policyRecord, language)
			if err != nil {
				return err
			}
		}

		stored, duplicate, err = h.insertConsent(tx, record, policyRecord, rpd, policyType, source)
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

	var packID string
	if decision != nil {
		packID = decision.Policy.ID
	}

	resp := consentResponse{
		ID:         stored.Id,
		SubjectID:  stored.GetString("subject"),
		PolicyID:   stored.GetString("policy"),
		PackID:     packID,
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

// packOf reads the pack id off a stored decision, once per decision.
func packOf(c *Ctx, decisionID string, seen map[string]string) (string, error) {
	if decisionID == "" {
		return "", nil
	}
	if packID, ok := seen[decisionID]; ok {
		return packID, nil
	}
	decision, err := c.DB().FindByID("runtimePolicyDecision", decisionID)
	if err != nil {
		return "", err
	}
	seen[decisionID] = decision.GetString("packId")
	return seen[decisionID], nil
}

func (h *Handler) listConsent(c *Ctx, _ any) (map[string]any, error) {
	subjectID := c.Path("subjectId")
	if subjectID == "" {
		return nil, BadRequest(codeSubjectIDRequired, "Subject ID is required")
	}

	records, err := c.DB().FindAll("consent", "subject = {:subject}", "-givenAt", 0, 0, dbx.Params{"subject": subjectID})
	if err != nil {
		return nil, err
	}

	packs := map[string]string{}
	out := make([]consentResponse, 0, len(records))
	for _, r := range records {
		packID, err := packOf(c, r.GetString("runtimePolicyDecision"), packs)
		if err != nil {
			return nil, err
		}
		out = append(out, consentResponse{
			ID:         r.Id,
			SubjectID:  r.GetString("subject"),
			PolicyID:   r.GetString("policy"),
			PackID:     packID,
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
	return request.ClientIP(c.Event.Request.Header, h.ipOptions(c.Event.Request))
}

func storedIf(allowed bool, value string) string {
	if !allowed {
		return ""
	}
	return value
}

func (h *Handler) resolve(r *http.Request) (jurisdiction.Location, jurisdiction.Code, *policy.Decision, error) {
	loc := h.locationOf(r)

	code := jurisdiction.Resolve(loc, h.cfg.GeoDisabled)
	if h.cfg.PolicyPacks == nil {
		resolution := policyrule.Resolve(policyrule.ResolveInput{Rules: h.cfg.PolicyRules, Country: loc.CountryCode, Region: loc.RegionCode, IABEnabled: &h.cfg.IABEnabled})
		rule, fingerprints := policyrule.SafeFallback()
		if resolution.Status == policyrule.StatusMatched {
			rule, fingerprints = *resolution.Policy, *resolution.Fingerprints
		}
		matchedBy := resolution.MatchedBy
		if matchedBy == "" {
			matchedBy = policyrule.MatchedByFallback
		}
		return loc, code, &policy.Decision{Policy: projectRule(rule), Fingerprint: fingerprints.Policy, MatchedBy: policy.MatchedBy(matchedBy), Resolution: &resolution}, nil
	}

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

func optionalString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (h *Handler) ipOptions(r *http.Request) request.IPOptions {
	return request.IPOptions{
		Peer:            r.RemoteAddr,
		TrustedProxies:  h.cfg.TrustedProxies,
		DisableTracking: h.cfg.TrackIPDisabled,
		DisableMasking:  h.cfg.MaskIPDisabled,
		Headers:         h.cfg.IPHeaders,
	}
}

func hasGPCSignal(r *http.Request) bool {
	value := gpcSignal(r)
	return value != nil && *value
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
	if err := requireQuery(c, "externalId", codeExternalIDRequired); err != nil {
		return nil, err
	}
	if err := requireQuery(c, "type", codeTypeRequired); err != nil {
		return nil, err
	}
	externalID := c.Query("externalId")
	rawTypes := c.Query("type")

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
		return nil, Unprocessable(codeTypeRequired, "type query parameter is required")
	}

	subjects, err := c.DB().FindAll("subject", "externalId = {:ext}", "", 0, 0, dbx.Params{"ext": externalID})
	if err != nil {
		return nil, err
	}
	if len(subjects) == 0 {
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
		if err != nil && !isMissing(err) {
			return nil, err
		}
		if latest != nil {
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
			if isMissing(err) {
				continue
			}
			return nil, err
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

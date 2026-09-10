// Package consent builds consent records from a request and its resolved
// policy, applying the policy's own constraints before anything is persisted.
package consent

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"thom/core/jurisdiction"
	"thom/core/policy"
)

type UISource string

const (
	SourceBanner UISource = "banner"
	SourceDialog UISource = "dialog"
	SourceWidget UISource = "widget"
	SourceAPI    UISource = "api"
)

var uiSources = []UISource{SourceBanner, SourceDialog, SourceWidget, SourceAPI}

type Action string

const (
	ActionAcceptAll Action = "accept_all"
	ActionRejectAll Action = "reject_all"
	ActionOptOut    Action = "opt_out"
	ActionCustom    Action = "custom"
)

var actions = []Action{ActionAcceptAll, ActionRejectAll, ActionOptOut, ActionCustom}

// GPCCategories are withdrawn when a Global Privacy Control signal accompanies
// an auto-granted consent under a policy with gpc enabled.
var GPCCategories = []string{"marketing", "measurement"}

// autoGrantedActions are the blanket choices a client makes on the subject's
// behalf; an explicit selection is never overridden by GPC.
var autoGrantedActions = []Action{ActionAcceptAll, ""}

var (
	ErrOutOfScope = errors.New("category outside the policy scope")
	ErrInvalid    = errors.New("invalid consent input")
)

func IsOutOfScope(err error) bool {
	return errors.Is(err, ErrOutOfScope)
}

func IsInvalid(err error) bool {
	return errors.Is(err, ErrInvalid) || errors.Is(err, ErrOutOfScope)
}

type Input struct {
	SubjectID    string
	DomainID     string
	TenantID     string
	Categories   []string
	Policy       policy.Resolved
	Jurisdiction jurisdiction.Code
	IPAddress    string
	UserAgent    string
	Language     string
	UISource     UISource
	Action       Action
	TCString     string
	Metadata     map[string]any
	GPCSignal    bool
	Now          time.Time
}

type Record struct {
	SubjectID         string
	DomainID          string
	TenantID          string
	Categories        []string
	PolicyID          string
	Jurisdiction      string
	JurisdictionModel string
	IPAddress         string
	UserAgent         string
	Language          string
	UISource          UISource
	Action            Action
	TCString          string
	Metadata          map[string]any
	GivenAt           time.Time
	ValidUntil        *time.Time
}

func Build(in Input) (Record, error) {
	if in.SubjectID == "" {
		return Record{}, fmt.Errorf("%w: subject id is required", ErrInvalid)
	}
	if in.DomainID == "" {
		return Record{}, fmt.Errorf("%w: domain id is required", ErrInvalid)
	}
	if in.UISource != "" && !slices.Contains(uiSources, in.UISource) {
		return Record{}, fmt.Errorf("%w: unknown ui source %q", ErrInvalid, in.UISource)
	}
	if in.Action != "" && !slices.Contains(actions, in.Action) {
		return Record{}, fmt.Errorf("%w: unknown action %q", ErrInvalid, in.Action)
	}

	categories := dedupeTrimmed(in.Categories)

	if err := checkScope(categories, in.Policy); err != nil {
		return Record{}, err
	}

	action := in.Action
	if gpcApplies(in, action) {
		categories = withoutGPCCategories(categories)
		action = ActionOptOut
	}

	now := in.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	return Record{
		SubjectID:         in.SubjectID,
		DomainID:          in.DomainID,
		TenantID:          in.TenantID,
		Categories:        categories,
		PolicyID:          in.Policy.ID,
		Jurisdiction:      string(in.Jurisdiction),
		JurisdictionModel: string(in.Policy.Model),
		IPAddress:         in.IPAddress,
		UserAgent:         in.UserAgent,
		Language:          in.Language,
		UISource:          in.UISource,
		Action:            action,
		TCString:          in.TCString,
		Metadata:          in.Metadata,
		GivenAt:           now,
		ValidUntil:        validUntil(now, in.Policy),
	}, nil
}

// A strict policy rejects categories outside its allowlist; a permissive one
// records them and leaves enforcement to the client.
func checkScope(categories []string, p policy.Resolved) error {
	if p.Consent == nil || p.Consent.ScopeMode != policy.ScopeStrict {
		return nil
	}

	allowed := p.Consent.Categories
	if len(allowed) == 0 || slices.Contains(allowed, policy.CategoryWildcard) {
		return nil
	}

	for _, c := range categories {
		if !slices.Contains(allowed, c) {
			return fmt.Errorf("%w: %q not in %v", ErrOutOfScope, c, allowed)
		}
	}

	return nil
}

func gpcApplies(in Input, action Action) bool {
	if !in.GPCSignal || in.Policy.Consent == nil {
		return false
	}
	if in.Policy.Consent.GPC == nil || !*in.Policy.Consent.GPC {
		return false
	}
	return slices.Contains(autoGrantedActions, action)
}

func withoutGPCCategories(categories []string) []string {
	var out []string
	for _, c := range categories {
		if !slices.Contains(GPCCategories, c) {
			out = append(out, c)
		}
	}
	return out
}

func validUntil(now time.Time, p policy.Resolved) *time.Time {
	if p.Consent == nil || p.Consent.ExpiryDays == nil || *p.Consent.ExpiryDays <= 0 {
		return nil
	}
	t := now.AddDate(0, 0, *p.Consent.ExpiryDays)
	return &t
}

func dedupeTrimmed(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))

	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, dup := seen[v]; dup {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}

	if len(out) == 0 {
		return nil
	}
	return out
}

type DecisionKey struct {
	TenantID     string
	Fingerprint  string
	MatchedBy    string
	CountryCode  string
	RegionCode   string
	Jurisdiction string
	Language     string
}

func DedupeKey(k DecisionKey) string {
	parts := strings.Join([]string{
		k.TenantID,
		k.Fingerprint,
		k.MatchedBy,
		k.CountryCode,
		k.RegionCode,
		k.Jurisdiction,
		k.Language,
	}, "\x1f")

	sum := sha256.Sum256([]byte(parts))
	return hex.EncodeToString(sum[:])
}

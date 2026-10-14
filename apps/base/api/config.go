package api

import (
	"errors"
	"net/netip"
	"time"

	"thom/core/erasure"
	"thom/core/i18n"
	"thom/core/policy"
	"thom/core/ratelimit"
)

type Config struct {
	// TenantID scopes every row this instance writes. The deployment model is
	// one instance per client, so it is set once here rather than derived from
	// a request. Leave empty for a single-tenant database.
	TenantID string

	PolicyPacks []policy.Config
	IABEnabled  bool

	// ErasureMode is what an erasure request does with a visitor's rows.
	ErasureMode erasure.Mode

	// Messages replace bundled notice strings per profile. Empty serves the
	// bundle unchanged.
	Messages i18n.Messages

	// GeoDisabled forces an unknown location, which resolves jurisdiction to
	// GDPR and lets a fallback policy apply.
	GeoDisabled     bool
	TrackIPDisabled bool
	MaskIPDisabled  bool

	// IPHeaders are the only headers read for a client address, in order. Set it
	// to the header your proxy writes: the default list also trusts headers a
	// client can send itself, so a caller could pick its own address.
	IPHeaders []string

	// TrustedProxies are the peers whose IP headers are believed. Set it to
	// your proxy's addresses and a client can no longer pick its own address,
	// for the stored IP and for the rate limit. Unset, the headers are trusted
	// from any peer.
	TrustedProxies []netip.Prefix

	// Snapshot tokens are off until a secret is configured. SnapshotRequired
	// rejects a write without a valid token; otherwise a failure falls back to
	// resolving the policy for the request as it arrives. ConfigFromEnv turns
	// it on with the secret unless C15T_SNAPSHOT_REQUIRED says otherwise.
	SnapshotSecret   string
	SnapshotIssuer   string
	SnapshotAudience string
	SnapshotTTL      time.Duration
	SnapshotRequired bool

	// Legal-document snapshot tokens are proof of which release of a document a
	// visitor was shown. They are issued by whatever renders the document and
	// signed with this shared secret. With a secret set, a consent to a legal
	// document must carry one; the audience is used as written when set.
	LegalDocSnapshotSecret   string
	LegalDocSnapshotIssuer   string
	LegalDocSnapshotAudience string

	// Rate limits are per api key and client address. A zero Limit disables the
	// rule. CheckRate guards the cross-device check, which answers questions
	// about an arbitrary externalId and is the easiest endpoint to abuse.
	CheckRate   ratelimit.Rule
	WriteRate   ratelimit.Rule
	DefaultRate ratelimit.Rule
}

func DefaultConfig() Config {
	return Config{
		ErasureMode: erasure.Anonymise,
		CheckRate:   ratelimit.Rule{Limit: 30, Window: time.Minute},
		WriteRate:   ratelimit.Rule{Limit: 60, Window: time.Minute},
		DefaultRate: ratelimit.Rule{Limit: 300, Window: time.Minute},

		PolicyPacks: []policy.Config{
			policy.PresetEuropeOptIn(),
			policy.PresetCaliforniaOptOut(),
			policy.PresetQuebec(),
			policy.PresetBrazilOptIn(),
			policy.PresetWorldNoBanner(),
		},
	}
}

// ValidateConfig checks what can be checked before serving. An invalid policy
// pack, or a policy naming translations that cannot exist, is an error, so it
// stops startup instead of failing every request; the warnings are for the
// operator to read.
func ValidateConfig(cfg Config) ([]string, error) {
	result := policy.Inspect(cfg.PolicyPacks, cfg.IABEnabled)

	if len(result.Errors) > 0 {
		return nil, errors.New("policyPacks: " + result.Errors[0])
	}

	warnings := make([]string, 0, len(result.Warnings))
	for _, w := range result.Warnings {
		warnings = append(warnings, "policyPacks: "+w)
	}

	var asked []i18n.PolicyI18n
	for _, p := range cfg.PolicyPacks {
		if p.I18n == nil {
			continue
		}
		ask := i18n.PolicyI18n{PolicyID: p.ID}
		if p.I18n.Language != nil {
			ask.Language = *p.I18n.Language
		}
		if p.I18n.MessageProfile != nil {
			ask.Profile = *p.I18n.MessageProfile
		}
		asked = append(asked, ask)
	}

	i18nWarnings, err := cfg.Messages.Check(asked)
	if err != nil {
		return nil, errors.New("i18n: " + err.Error())
	}
	for _, w := range i18nWarnings {
		warnings = append(warnings, "i18n: "+w)
	}
	return warnings, nil
}

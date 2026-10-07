package api

import (
	"errors"
	"time"

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
	// GeoDisabled forces an unknown location, which resolves jurisdiction to
	// GDPR and lets a fallback policy apply.
	GeoDisabled     bool
	TrackIPDisabled bool
	MaskIPDisabled  bool

	// IPHeaders are the only headers read for a client address, in order. Set it
	// to the header your proxy writes: the default list also trusts headers a
	// client can send itself, so a caller could pick its own address.
	IPHeaders []string

	// Snapshot tokens are off until a secret is configured. SnapshotRequired
	// rejects a write without a valid token; otherwise a failure falls back to
	// resolving the policy for the request as it arrives.
	SnapshotSecret   string
	SnapshotIssuer   string
	SnapshotAudience string
	SnapshotTTL      time.Duration
	SnapshotRequired bool

	// Rate limits are per api key and client address. A zero Limit disables the
	// rule. CheckRate guards the cross-device check, which answers questions
	// about an arbitrary externalId and is the easiest endpoint to abuse.
	CheckRate   ratelimit.Rule
	WriteRate   ratelimit.Rule
	DefaultRate ratelimit.Rule
}

func DefaultConfig() Config {
	return Config{
		CheckRate:   ratelimit.Rule{Limit: 30, Window: time.Minute},
		WriteRate:   ratelimit.Rule{Limit: 60, Window: time.Minute},
		DefaultRate: ratelimit.Rule{Limit: 300, Window: time.Minute},

		PolicyPacks: []policy.Config{
			policy.PresetEurope(policy.ModelOptIn),
			policy.PresetCalifornia(policy.ModelOptOut),
			policy.PresetQuebec(),
			policy.PresetWorldNoBanner(),
		},
	}
}

// ValidateConfig checks what can be checked before serving. An invalid policy
// pack is an error, so it stops startup instead of failing every request; the
// warnings are for the operator to read.
func ValidateConfig(cfg Config) ([]string, error) {
	result := policy.Inspect(cfg.PolicyPacks, cfg.IABEnabled)

	if len(result.Errors) > 0 {
		return nil, errors.New("policyPacks: " + result.Errors[0])
	}

	warnings := make([]string, 0, len(result.Warnings))
	for _, w := range result.Warnings {
		warnings = append(warnings, "policyPacks: "+w)
	}
	return warnings, nil
}

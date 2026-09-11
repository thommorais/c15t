package api

import (
	"time"

	"thom/core/policy"
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

	// Snapshot tokens are off until a secret is configured. SnapshotRequired
	// rejects a write without a valid token; otherwise a failure falls back to
	// resolving the policy for the request as it arrives.
	SnapshotSecret   string
	SnapshotIssuer   string
	SnapshotAudience string
	SnapshotTTL      time.Duration
	SnapshotRequired bool
}

func DefaultConfig() Config {
	return Config{
		PolicyPacks: []policy.Config{
			policy.PresetEurope(policy.ModelOptIn),
			policy.PresetCalifornia(policy.ModelOptOut),
			policy.PresetQuebec(),
			policy.PresetWorldNoBanner(),
		},
	}
}

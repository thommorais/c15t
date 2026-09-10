package api

import "thom/core/policy"

type Config struct {
	PolicyPacks []policy.Config
	IABEnabled  bool
	// GeoDisabled forces an unknown location, which resolves jurisdiction to
	// GDPR and lets a fallback policy apply.
	GeoDisabled     bool
	TrackIPDisabled bool
	MaskIPDisabled  bool
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

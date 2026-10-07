package api

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"thom/core/ratelimit"
)

func ConfigFromEnv(getenv func(string) string) (Config, error) {
	cfg := DefaultConfig()
	cfg.TenantID = getenv("C15T_TENANT_ID")
	cfg.SnapshotSecret = getenv("C15T_SNAPSHOT_SECRET")
	cfg.SnapshotIssuer = getenv("C15T_SNAPSHOT_ISSUER")
	cfg.SnapshotAudience = getenv("C15T_SNAPSHOT_AUDIENCE")
	cfg.LegalDocSnapshotSecret = getenv("C15T_LEGAL_DOC_SNAPSHOT_SECRET")
	cfg.LegalDocSnapshotIssuer = getenv("C15T_LEGAL_DOC_SNAPSHOT_ISSUER")
	cfg.LegalDocSnapshotAudience = getenv("C15T_LEGAL_DOC_SNAPSHOT_AUDIENCE")

	headers, err := parseHeaderNames("C15T_IP_HEADERS", getenv("C15T_IP_HEADERS"))
	if err != nil {
		return Config{}, err
	}
	cfg.IPHeaders = headers

	bools := []struct {
		key string
		dst *bool
	}{
		{"C15T_IAB_ENABLED", &cfg.IABEnabled},
		{"C15T_GEO_DISABLED", &cfg.GeoDisabled},
		{"C15T_TRACK_IP_DISABLED", &cfg.TrackIPDisabled},
		{"C15T_MASK_IP_DISABLED", &cfg.MaskIPDisabled},
		{"C15T_SNAPSHOT_REQUIRED", &cfg.SnapshotRequired},
	}
	for _, b := range bools {
		if v := getenv(b.key); v != "" {
			parsed, err := strconv.ParseBool(v)
			if err != nil {
				return Config{}, fmt.Errorf("%s: %q is not a boolean", b.key, v)
			}
			*b.dst = parsed
		}
	}

	if v := getenv("C15T_SNAPSHOT_TTL"); v != "" {
		ttl, err := time.ParseDuration(v)
		if err != nil || ttl <= 0 {
			return Config{}, fmt.Errorf("C15T_SNAPSHOT_TTL: %q is not a positive duration", v)
		}
		cfg.SnapshotTTL = ttl
	}

	if cfg.SnapshotRequired && cfg.SnapshotSecret == "" {
		return Config{}, fmt.Errorf("C15T_SNAPSHOT_REQUIRED needs C15T_SNAPSHOT_SECRET")
	}

	rules := []struct {
		prefix string
		dst    *ratelimit.Rule
	}{
		{"C15T_RATE_CHECK", &cfg.CheckRate},
		{"C15T_RATE_WRITE", &cfg.WriteRate},
		{"C15T_RATE_DEFAULT", &cfg.DefaultRate},
	}
	for _, r := range rules {
		if v := getenv(r.prefix + "_LIMIT"); v != "" {
			limit, err := strconv.Atoi(v)
			if err != nil || limit < 0 {
				return Config{}, fmt.Errorf("%s_LIMIT: %q is not a non-negative integer", r.prefix, v)
			}
			r.dst.Limit = limit
		}
		if v := getenv(r.prefix + "_WINDOW"); v != "" {
			window, err := time.ParseDuration(v)
			if err != nil || window <= 0 {
				return Config{}, fmt.Errorf("%s_WINDOW: %q is not a positive duration", r.prefix, v)
			}
			r.dst.Window = window
		}
	}

	return cfg, nil
}

func parseHeaderNames(name, raw string) ([]string, error) {
	var out []string

	for _, entry := range strings.Split(raw, ",") {
		entry = strings.ToLower(strings.TrimSpace(entry))
		if entry == "" {
			continue
		}
		for _, r := range entry {
			if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
				return nil, fmt.Errorf("%s: %q is not a header name", name, entry)
			}
		}
		out = append(out, entry)
	}

	return out, nil
}

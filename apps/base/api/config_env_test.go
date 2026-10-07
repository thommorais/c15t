package api

import (
	"slices"
	"strings"
	"testing"
	"time"
)

func envFrom(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestConfigFromEnvDefaults(t *testing.T) {
	got, err := ConfigFromEnv(envFrom(nil))
	if err != nil {
		t.Fatal(err)
	}
	want := DefaultConfig()
	if got.CheckRate != want.CheckRate || got.WriteRate != want.WriteRate || got.DefaultRate != want.DefaultRate {
		t.Fatalf("rates changed: %+v", got)
	}
	if len(got.PolicyPacks) != len(want.PolicyPacks) {
		t.Fatalf("policy packs changed: %d", len(got.PolicyPacks))
	}
	if got.IABEnabled || got.GeoDisabled || got.TrackIPDisabled || got.MaskIPDisabled || got.SnapshotSecret != "" {
		t.Fatalf("flags should default off: %+v", got)
	}
}

func TestConfigFromEnvReadsEveryField(t *testing.T) {
	got, err := ConfigFromEnv(envFrom(map[string]string{
		"C15T_TENANT_ID":           "acme",
		"C15T_IAB_ENABLED":         "true",
		"C15T_GEO_DISABLED":        "1",
		"C15T_TRACK_IP_DISABLED":   "true",
		"C15T_MASK_IP_DISABLED":    "true",
		"C15T_SNAPSHOT_SECRET":     "s3cret",
		"C15T_SNAPSHOT_ISSUER":     "iss",
		"C15T_SNAPSHOT_AUDIENCE":   "aud",
		"C15T_SNAPSHOT_TTL":        "15m",
		"C15T_SNAPSHOT_REQUIRED":   "true",
		"C15T_RATE_CHECK_LIMIT":    "5",
		"C15T_RATE_CHECK_WINDOW":   "10s",
		"C15T_RATE_WRITE_LIMIT":    "0",
		"C15T_RATE_DEFAULT_LIMIT":  "100",
		"C15T_RATE_DEFAULT_WINDOW": "2m",
	}))
	if err != nil {
		t.Fatal(err)
	}

	if got.TenantID != "acme" || !got.IABEnabled || !got.GeoDisabled || !got.TrackIPDisabled || !got.MaskIPDisabled {
		t.Fatalf("scalars not read: %+v", got)
	}
	if got.SnapshotSecret != "s3cret" || got.SnapshotIssuer != "iss" || got.SnapshotAudience != "aud" ||
		got.SnapshotTTL != 15*time.Minute || !got.SnapshotRequired {
		t.Fatalf("snapshot not read: %+v", got)
	}
	if got.CheckRate.Limit != 5 || got.CheckRate.Window != 10*time.Second {
		t.Fatalf("check rate: %+v", got.CheckRate)
	}
	if got.WriteRate.Limit != 0 {
		t.Fatalf("write rate should be disabled: %+v", got.WriteRate)
	}
	if got.WriteRate.Window != DefaultConfig().WriteRate.Window {
		t.Fatalf("unset window should keep the default: %+v", got.WriteRate)
	}
	if got.DefaultRate.Limit != 100 || got.DefaultRate.Window != 2*time.Minute {
		t.Fatalf("default rate: %+v", got.DefaultRate)
	}
}

func TestConfigFromEnvRejectsBadValues(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"bool", map[string]string{"C15T_IAB_ENABLED": "yes"}, "C15T_IAB_ENABLED"},
		{"duration", map[string]string{"C15T_SNAPSHOT_TTL": "soon"}, "C15T_SNAPSHOT_TTL"},
		{"limit", map[string]string{"C15T_RATE_CHECK_LIMIT": "many"}, "C15T_RATE_CHECK_LIMIT"},
		{"negative limit", map[string]string{"C15T_RATE_CHECK_LIMIT": "-1"}, "C15T_RATE_CHECK_LIMIT"},
		{"window", map[string]string{"C15T_RATE_WRITE_WINDOW": "0s"}, "C15T_RATE_WRITE_WINDOW"},
		{"required without secret", map[string]string{"C15T_SNAPSHOT_REQUIRED": "true"}, "C15T_SNAPSHOT_SECRET"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ConfigFromEnv(envFrom(tt.env))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("want error naming %s, got %v", tt.want, err)
			}
		})
	}
}

func TestConfigFromEnvReadsTheTrustedIPHeaders(t *testing.T) {
	got, err := ConfigFromEnv(envFrom(map[string]string{"C15T_IP_HEADERS": " CF-Connecting-IP , x-real-ip ,, "}))
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"cf-connecting-ip", "x-real-ip"}; !slices.Equal(got.IPHeaders, want) {
		t.Errorf("IPHeaders = %v, want %v", got.IPHeaders, want)
	}

	unset, err := ConfigFromEnv(envFrom(nil))
	if err != nil || unset.IPHeaders != nil {
		t.Errorf("unset: IPHeaders = %v (%v), want nil so the defaults apply", unset.IPHeaders, err)
	}

	for _, bad := range []string{"x real ip", "x-real-ip:", "x/real"} {
		if _, err := ConfigFromEnv(envFrom(map[string]string{"C15T_IP_HEADERS": bad})); err == nil || !strings.Contains(err.Error(), "C15T_IP_HEADERS") {
			t.Errorf("%q: want an error naming C15T_IP_HEADERS, got %v", bad, err)
		}
	}
}

func TestConfigFromEnvReadsTheLegalDocumentSnapshotSettings(t *testing.T) {
	got, err := ConfigFromEnv(envFrom(map[string]string{
		"C15T_LEGAL_DOC_SNAPSHOT_SECRET":   "doc-secret",
		"C15T_LEGAL_DOC_SNAPSHOT_ISSUER":   "renderer",
		"C15T_LEGAL_DOC_SNAPSHOT_AUDIENCE": "docs.example",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if got.LegalDocSnapshotSecret != "doc-secret" || got.LegalDocSnapshotIssuer != "renderer" || got.LegalDocSnapshotAudience != "docs.example" {
		t.Errorf("legal document snapshot settings not read: %+v", got)
	}

	unset, _ := ConfigFromEnv(envFrom(nil))
	if unset.LegalDocSnapshotSecret != "" {
		t.Errorf("secret = %q, want none so tokens stay off", unset.LegalDocSnapshotSecret)
	}
}

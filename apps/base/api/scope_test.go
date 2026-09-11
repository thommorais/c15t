package api

import (
	"strings"
	"testing"
)

func TestScopeFilter(t *testing.T) {
	tests := []struct {
		name   string
		tenant string
		filter string
		want   string
	}{
		{
			name:   "appends to an existing filter",
			tenant: "acme",
			filter: "subject = {:subject}",
			want:   "(subject = {:subject}) && tenantId = {:__tenant}",
		},
		{
			name:   "stands alone when the filter is empty",
			tenant: "acme",
			filter: "",
			want:   "tenantId = {:__tenant}",
		},
		{
			name:   "matches an empty tenant explicitly",
			tenant: "",
			filter: "subject = {:subject}",
			want:   "(subject = {:subject}) && tenantId = {:__tenant}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := scopeFilter(tt.filter); got != tt.want {
				t.Errorf("scopeFilter(%q) = %q, want %q", tt.filter, got, tt.want)
			}
		})
	}
}

func TestScopeParamsCarriesTenant(t *testing.T) {
	got := scopeParams(nil, "acme")
	if got["__tenant"] != "acme" {
		t.Errorf("__tenant = %v, want acme", got["__tenant"])
	}

	got = scopeParams(map[string]any{"subject": "s1"}, "acme")
	if got["subject"] != "s1" {
		t.Error("existing params were dropped")
	}
	if got["__tenant"] != "acme" {
		t.Errorf("__tenant = %v, want acme", got["__tenant"])
	}
}

// The tenant parameter must not collide with a caller's own binding.
func TestScopeParamsDoesNotOverwriteCallerParams(t *testing.T) {
	got := scopeParams(map[string]any{"tenant": "caller-value"}, "acme")

	if got["tenant"] != "caller-value" {
		t.Errorf("caller's tenant param = %v, want caller-value", got["tenant"])
	}
	if got["__tenant"] != "acme" {
		t.Errorf("__tenant = %v, want acme", got["__tenant"])
	}
}

func TestUnscopedCollections(t *testing.T) {
	if !isUnscoped("apiKey") {
		t.Error("apiKey must be exempt: it has no tenant column")
	}
	for _, name := range []string{"consent", "subject", "domain", "consentPolicy", "auditLog"} {
		if isUnscoped(name) {
			t.Errorf("%q must be tenant scoped", name)
		}
	}
}

func TestScopedFilterIsNotDoubleApplied(t *testing.T) {
	once := scopeFilter("a = 1")
	twice := scopeFilter(once)

	if strings.Count(twice, "__tenant") != 1 {
		t.Errorf("tenant clause applied twice: %q", twice)
	}
}

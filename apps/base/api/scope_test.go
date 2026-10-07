package api

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
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

func TestScopeFilterConstrainsTheTenantWhateverTheFilterSays(t *testing.T) {
	tests := []struct {
		name   string
		filter string
		want   string
	}{
		{
			name:   "an or clause that mentions the tenant parameter",
			filter: "subject = {:subject} || tenantId = {:__tenant}",
			want:   "(subject = {:subject} || tenantId = {:__tenant}) && tenantId = {:__tenant}",
		},
		{
			name:   "text that merely contains the parameter name",
			filter: "name = '__tenant'",
			want:   "(name = '__tenant') && tenantId = {:__tenant}",
		},
		{
			name:   "an already scoped filter is scoped again, which is harmless",
			filter: scopeFilter("a = 1"),
			want:   "((a = 1) && tenantId = {:__tenant}) && tenantId = {:__tenant}",
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

func TestScopeSaveRefusesARecordFromAnotherTenant(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	if err := app.RunAppMigrations(); err != nil {
		t.Fatal(err)
	}

	collection, err := app.FindCollectionByNameOrId("domain")
	if err != nil {
		t.Fatal(err)
	}

	acme := &scope{app: app, tenant: "acme"}

	for name, tenantID := range map[string]string{"another tenant": "other", "no tenant": ""} {
		t.Run(name, func(t *testing.T) {
			record := core.NewRecord(collection)
			record.Set("name", "example.com")
			record.Set("tenantId", tenantID)

			if err := acme.Save(record); !errors.Is(err, errNotOwned) {
				t.Errorf("Save = %v, want errNotOwned: a record not stamped for this tenant must not be written", err)
			}
		})
	}

	own, err := acme.New("domain")
	if err != nil {
		t.Fatal(err)
	}
	own.Set("name", "example.com")
	if err := acme.Save(own); err != nil {
		t.Errorf("a record from New must save: %v", err)
	}

	if err := (&scope{app: app}).Save(core.NewRecord(collection)); errors.Is(err, errNotOwned) {
		t.Error("a deployment with no tenant owns its database and must not be refused")
	}
}

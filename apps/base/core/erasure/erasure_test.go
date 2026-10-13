package erasure

import (
	"reflect"
	"testing"
)

func TestScrubSubject(t *testing.T) {
	got := Scrub("subject", map[string]any{
		"externalId":       "user-42",
		"identityProvider": "auth0",
	})

	want := map[string]any{"externalId": nil, "identityProvider": nil}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Scrub = %v, want %v", got, want)
	}
}

func TestScrubConsentKeepsOnlyServerMetadata(t *testing.T) {
	got := Scrub("consent", map[string]any{
		"ipAddress": "203.0.113.7",
		"userAgent": "Mozilla/5.0",
		"metadata": map[string]any{
			"clientGivenAt":  "2026-03-01T12:00:00Z",
			"policyLanguage": "pt-BR",
			"email":          "someone@example.com",
		},
	})

	want := map[string]any{
		"ipAddress": nil,
		"userAgent": nil,
		"metadata": map[string]any{
			"clientGivenAt":  "2026-03-01T12:00:00Z",
			"policyLanguage": "pt-BR",
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Scrub = %v, want %v", got, want)
	}
}

func TestScrubConsentWithoutMetadata(t *testing.T) {
	got := Scrub("consent", map[string]any{"ipAddress": "203.0.113.7", "userAgent": "", "metadata": nil})

	if got["metadata"] != nil {
		t.Errorf("metadata = %v, want nil", got["metadata"])
	}
}

func TestScrubAuditLogDropsIdentityAtAnyDepth(t *testing.T) {
	got := Scrub("auditLog", map[string]any{
		"ipAddress": "203.0.113.7",
		"userAgent": "Mozilla/5.0",
		"metadata":  map[string]any{"anything": "x"},
		"changes": map[string]any{
			"before": map[string]any{"externalId": "old", "identityProvider": "auth0"},
			"after":  map[string]any{"externalId": "new", "identityProvider": "auth0"},
		},
	})

	want := map[string]any{
		"ipAddress": nil,
		"userAgent": nil,
		"metadata":  nil,
		"changes": map[string]any{
			"before": map[string]any{},
			"after":  map[string]any{},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Scrub = %v, want %v", got, want)
	}
}

func TestScrubAuditLogKeepsConsentChanges(t *testing.T) {
	changes := map[string]any{"categories": []any{"necessary"}, "policyId": "p1", "action": "accept"}

	got := Scrub("auditLog", map[string]any{"changes": changes})

	if !reflect.DeepEqual(got["changes"], changes) {
		t.Errorf("changes = %v, want the consent change kept", got["changes"])
	}
}

func TestScrubDoesNotChangeItsInput(t *testing.T) {
	in := map[string]any{"metadata": map[string]any{"email": "someone@example.com"}}

	Scrub("consent", in)

	if in["metadata"].(map[string]any)["email"] == nil {
		t.Error("Scrub changed the caller's map")
	}
}

func TestPersonalFields(t *testing.T) {
	tests := map[string][]string{
		"subject":  {"externalId", "identityProvider"},
		"consent":  {"ipAddress", "metadata", "userAgent"},
		"auditLog": {"changes", "ipAddress", "metadata", "userAgent"},
		"domain":   nil,
	}

	for collection, want := range tests {
		if got := PersonalFields(collection); !reflect.DeepEqual(got, want) {
			t.Errorf("PersonalFields(%q) = %v, want %v", collection, got, want)
		}
	}
}

func TestClassified(t *testing.T) {
	if !Classified("consent", "givenAt") || !Classified("consent", "ipAddress") {
		t.Error("known consent fields must be classified")
	}
	if Classified("consent", "phone") || Classified("unknown", "id") {
		t.Error("a field nobody classified must report false")
	}
}

package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"thom/api"
	"thom/core/erasure"
)

func TestEveryStoredFieldIsClassifiedForErasure(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	collections, err := h.app.FindAllCollections()
	if err != nil {
		t.Fatal(err)
	}

	for _, c := range collections {
		if c.System {
			continue
		}
		for _, field := range c.Fields {
			if !erasure.Classified(c.Name, field.GetName()) {
				t.Errorf("%s.%s has no erasure rule: classify it in core/erasure", c.Name, field.GetName())
			}
		}
	}
}

type erasureFixture struct {
	h       *harness
	key     string
	direct  string
	linked  string
	other   string
	visitor map[string]string
}

func newErasureFixture(t *testing.T) erasureFixture {
	t.Helper()

	h := newHarness(t, api.DefaultConfig())
	f := erasureFixture{h: h, key: h.key()}
	f.visitor = auth(f.key, "cf-ipcountry", "DE", "X-Forwarded-For", "203.0.113.7", "User-Agent", "TestAgent/1.0")

	write := func(externalID string) string {
		rec := h.do(http.MethodPost, "/api/c15t/consent",
			`{"givenAt":"2026-03-01T12:00:00Z","externalId":"`+externalID+`","domain":"example.com","categories":["necessary"],"metadata":{"email":"someone@example.com"}}`,
			f.visitor)
		if rec.Code != http.StatusCreated {
			t.Fatalf("consent status = %d: %s", rec.Code, rec.Body.String())
		}
		id, _ := decode(t, rec)["subjectId"].(string)
		return id
	}

	f.direct = write("user-42")
	f.linked = write("device-temp")
	f.other = write("user-7")

	rec := h.do(http.MethodPatch, "/api/c15t/subjects/"+f.linked,
		`{"externalId":"user-42","identityProvider":"okta"}`, auth(f.key))
	if rec.Code != http.StatusOK {
		t.Fatalf("link status = %d: %s", rec.Code, rec.Body.String())
	}
	return f
}

func (f erasureFixture) erase(t *testing.T, body string) map[string]any {
	t.Helper()

	rec := f.h.do(http.MethodDelete, "/api/c15t/subjects", body, auth(f.key))
	if rec.Code != http.StatusOK {
		t.Fatalf("erase status = %d: %s", rec.Code, rec.Body.String())
	}
	return decode(t, rec)
}

func (f erasureFixture) rows(t *testing.T, collection, subjectField, subjectID string) []map[string]any {
	t.Helper()

	records, err := f.h.app.FindRecordsByFilter(collection, subjectField+" = {:id}", "", 0, 0, map[string]any{"id": subjectID})
	if err != nil {
		t.Fatalf("find %s: %v", collection, err)
	}
	out := make([]map[string]any, 0, len(records))
	for _, r := range records {
		out = append(out, r.PublicExport())
	}
	return out
}

func TestEraseScrubsEverySubjectOfAnExternalID(t *testing.T) {
	f := newErasureFixture(t)

	before := f.rows(t, "consent", "subject", f.direct)
	if len(before) != 1 || before[0]["ipAddress"] == "" || before[0]["userAgent"] == "" {
		t.Fatalf("fixture consent = %v, want an address and user agent to erase", before)
	}

	got := f.erase(t, `{"externalId":"user-42"}`)
	if got["subjects"] != 2.0 || got["consents"] != 2.0 {
		t.Errorf("response = %v, want 2 subjects and 2 consents", got)
	}

	for _, id := range []string{f.direct, f.linked} {
		subject, err := f.h.app.FindRecordById("subject", id)
		if err != nil {
			t.Fatalf("the subject row must stay as an opaque id: %v", err)
		}
		if subject.GetString("externalId") != "" || subject.GetString("identityProvider") != "" {
			t.Errorf("subject %s still names someone: %v", id, subject.PublicExport())
		}

		consents := f.rows(t, "consent", "subject", id)
		if len(consents) != 1 {
			t.Fatalf("consents for %s = %d, want the proof kept", id, len(consents))
		}
		c := consents[0]
		if c["ipAddress"] != "" || c["userAgent"] != "" {
			t.Errorf("consent still carries %v / %v", c["ipAddress"], c["userAgent"])
		}
		if c["givenAt"] == "" || len(c["purposes"].([]string)) == 0 {
			t.Errorf("consent lost what was agreed: %v", c)
		}

		raw, _ := json.Marshal(f.rows(t, "auditLog", "subject", id))
		for _, leaked := range []string{"user-42", "device-temp", "okta", "203.0.113", "TestAgent", "someone@example.com"} {
			if strings.Contains(string(raw), leaked) {
				t.Errorf("audit rows for %s still hold %q: %s", id, leaked, raw)
			}
		}
		raw, _ = json.Marshal(consents)
		if strings.Contains(string(raw), "someone@example.com") {
			t.Errorf("consent metadata still holds client data: %s", raw)
		}
	}

	untouched, err := f.h.app.FindRecordById("subject", f.other)
	if err != nil || untouched.GetString("externalId") != "user-7" {
		t.Errorf("another visitor's subject changed: %v", err)
	}
	if c := f.rows(t, "consent", "subject", f.other); c[0]["ipAddress"] == "" {
		t.Error("another visitor's consent was scrubbed")
	}
}

func TestEraseRecordsItselfWithoutIdentifiers(t *testing.T) {
	f := newErasureFixture(t)

	f.erase(t, `{"externalId":"user-42"}`)

	entries, err := f.h.app.FindRecordsByFilter("auditLog", "entityType = 'erasure'", "", 0, 0)
	if err != nil || len(entries) != 1 {
		t.Fatalf("erasure audit entries = %d (%v), want 1", len(entries), err)
	}
	raw, _ := json.Marshal(entries[0].PublicExport())
	if strings.Contains(string(raw), "user-42") {
		t.Errorf("the erasure entry names the person: %s", raw)
	}
}

func TestEraseIsIdempotent(t *testing.T) {
	f := newErasureFixture(t)

	f.erase(t, `{"externalId":"user-42"}`)
	got := f.erase(t, `{"externalId":"user-42"}`)

	if got["subjects"] != 0.0 || got["consents"] != 0.0 {
		t.Errorf("second erase = %v, want nothing left to erase", got)
	}
}

func TestEraseNeedsASecretKey(t *testing.T) {
	f := newErasureFixture(t)

	rec := f.h.do(http.MethodDelete, "/api/c15t/subjects", `{"externalId":"user-42"}`, auth(f.h.publishableKey()))
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for a publishable key", rec.Code)
	}
}

func TestEraseValidation(t *testing.T) {
	f := newErasureFixture(t)

	tests := []struct {
		name string
		body string
		want int
	}{
		{name: "no body", body: "", want: http.StatusBadRequest},
		{name: "no externalId", body: `{}`, want: http.StatusBadRequest},
		{name: "empty externalId", body: `{"externalId":""}`, want: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := f.h.do(http.MethodDelete, "/api/c15t/subjects", tt.body, auth(f.key))
			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body.String())
			}
		})
	}
}

func TestAnErasedSubjectCannotBeLinkedAgain(t *testing.T) {
	f := newErasureFixture(t)
	f.erase(t, `{"externalId":"user-42"}`)

	subject, err := f.h.app.FindRecordById("subject", f.direct)
	if err != nil {
		t.Fatal(err)
	}
	if subject.GetDateTime("erasedAt").IsZero() {
		t.Error("erasure must mark the subject so it stays unlinkable")
	}

	for name, key := range map[string]string{"publishable": f.h.publishableKey(), "secret": f.key} {
		rec := f.h.do(http.MethodPatch, "/api/c15t/subjects/"+f.direct, `{"externalId":"user-42"}`, auth(key))
		if rec.Code != http.StatusConflict || decode(t, rec)["code"] != "SUBJECT_ERASED" {
			t.Errorf("%s key: status = %d, want 409 SUBJECT_ERASED: %s", name, rec.Code, rec.Body.String())
		}
	}
}

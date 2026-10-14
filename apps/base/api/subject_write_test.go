package api_test

import (
	"net/http"
	"testing"

	"thom/api"
)

const anonymousWrite = `{"givenAt":"2026-03-01T12:00:00Z","domain":"example.com","categories":["necessary"]}`

func TestAWriteWithoutIdentityCreatesAnAnonymousSubject(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	key := h.publishableKey()

	rec := h.do(http.MethodPost, "/api/c15t/consent", anonymousWrite, auth(key, "cf-ipcountry", "DE"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	subjectID, _ := decode(t, rec)["subjectId"].(string)
	if subjectID == "" {
		t.Fatal("the response must carry the new subject's id for the client to keep")
	}

	subject, err := h.app.FindRecordById("subject", subjectID)
	if err != nil {
		t.Fatalf("subject not stored: %v", err)
	}
	if subject.GetString("externalId") != "" {
		t.Errorf("externalId = %q, want none", subject.GetString("externalId"))
	}

	again := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-02T12:00:00Z","subjectId":"`+subjectID+`","domain":"example.com","categories":["necessary"]}`,
		auth(key, "cf-ipcountry", "DE"))
	if got, _ := decode(t, again)["subjectId"].(string); got != subjectID {
		t.Errorf("subjectId = %q, want the same subject on a later write", got)
	}

	other := h.do(http.MethodPost, "/api/c15t/consent", anonymousWrite, auth(key, "cf-ipcountry", "DE"))
	if got, _ := decode(t, other)["subjectId"].(string); got == subjectID {
		t.Error("another anonymous write must get its own subject")
	}
}

func TestAWriteToAnErasedSubjectIsRefused(t *testing.T) {
	f := newErasureFixture(t)
	f.erase(t, `{"externalId":"user-42"}`)
	consentsBefore := f.h.count("consent")

	rec := f.h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-05T12:00:00Z","subjectId":"`+f.direct+`","domain":"example.com","categories":["necessary"]}`,
		f.visitor)
	if rec.Code != http.StatusConflict || decode(t, rec)["code"] != "SUBJECT_ERASED" {
		t.Fatalf("status = %d, want 409 SUBJECT_ERASED: %s", rec.Code, rec.Body.String())
	}
	if f.h.count("consent") != consentsBefore {
		t.Error("a refused write stored a consent")
	}
}

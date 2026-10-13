package api_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"thom/api"
)

func TestPublishableKeyLinksOnlyOnce(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	publishable, secret := h.publishableKey(), h.key()

	collection, err := h.app.FindCollectionByNameOrId("subject")
	if err != nil {
		t.Fatal(err)
	}
	subject := core.NewRecord(collection)
	if err := h.app.Save(subject); err != nil {
		t.Fatal(err)
	}
	url := "/api/c15t/subjects/" + subject.Id

	steps := []struct {
		name string
		key  string
		body string
		want int
	}{
		{name: "publishable sets the first link", key: publishable, body: `{"externalId":"user-9"}`, want: http.StatusOK},
		{name: "publishable repeats it", key: publishable, body: `{"externalId":"user-9"}`, want: http.StatusOK},
		{name: "publishable cannot move it", key: publishable, body: `{"externalId":"user-10"}`, want: http.StatusForbidden},
		{name: "secret can move it", key: secret, body: `{"externalId":"user-10"}`, want: http.StatusOK},
	}

	for _, step := range steps {
		rec := h.do(http.MethodPatch, url, step.body, auth(step.key))
		if rec.Code != step.want {
			t.Fatalf("%s: status = %d, want %d: %s", step.name, rec.Code, step.want, rec.Body.String())
		}
	}
}

func TestPublishableKeyRepeatsALinkMadeByAConsentWrite(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	publishable := h.publishableKey()

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-1","domain":"example.com","categories":["necessary"]}`,
		auth(publishable, "cf-ipcountry", "DE"))
	subjectID, _ := decode(t, rec)["subjectId"].(string)

	rec = h.do(http.MethodPatch, "/api/c15t/subjects/"+subjectID, `{"externalId":"user-1"}`, auth(publishable))
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200: the consent write stored no provider, which is the external one: %s", rec.Code, rec.Body.String())
	}
}

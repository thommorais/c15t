package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestUnexpectedErrorsDoNotLeak(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	rec := httptest.NewRecorder()
	e := &core.RequestEvent{}
	e.App = app
	e.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	e.Response = rec

	if err := respondError(e, errors.New("sqlite: table consent is locked")); err != nil {
		t.Fatal(err)
	}

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "sqlite") {
		t.Errorf("internal detail leaked: %s", rec.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != "INTERNAL_SERVER_ERROR" || body["message"] != "Internal server error" ||
		body["status"] != float64(500) || body["defined"] != true {
		t.Errorf("envelope = %v", body)
	}
}

func TestUnavailableCarriesItsCodeAndHidesTheCause(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	rec := httptest.NewRecorder()
	e := &core.RequestEvent{}
	e.App = app
	e.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	e.Response = rec

	cause := errors.New("sqlite: disk I/O error")
	if err := respondError(e, Unavailable(codeServiceUnavailable, "Database health check failed", cause)); err != nil {
		t.Fatal(err)
	}

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "sqlite") {
		t.Errorf("cause leaked: %s", rec.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != "SERVICE_UNAVAILABLE" || body["message"] != "Database health check failed" {
		t.Errorf("envelope = %v", body)
	}
}

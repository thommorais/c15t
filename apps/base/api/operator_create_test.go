package api_test

import (
	"net/http"
	"testing"

	"thom/api"
)

func TestCreateOperatorCanSignIn(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())

	if err := api.CreateOperator(h.app, "ops@acme.example", "correct-horse-battery", "acme"); err != nil {
		t.Fatalf("CreateOperator: %v", err)
	}

	rec := h.do(http.MethodPost, "/api/collections/operators/auth-with-password",
		`{"identity":"ops@acme.example","password":"correct-horse-battery"}`, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("login: %d %s", rec.Code, rec.Body.String())
	}
	record, _ := decode(t, rec)["record"].(map[string]any)
	if record["tenantId"] != "acme" {
		t.Errorf("tenantId = %v, want acme", record["tenantId"])
	}
}

func TestCreateOperatorRefuses(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	if err := api.CreateOperator(h.app, "taken@acme.example", "correct-horse-battery", "acme"); err != nil {
		t.Fatal(err)
	}

	tests := []struct{ name, email, password string }{
		{name: "no email", email: "", password: "correct-horse-battery"},
		{name: "not an email", email: "ops", password: "correct-horse-battery"},
		{name: "short password", email: "short@acme.example", password: "short"},
		{name: "taken email", email: "taken@acme.example", password: "correct-horse-battery"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := api.CreateOperator(h.app, tt.email, tt.password, "acme"); err == nil {
				t.Error("want an error")
			}
		})
	}
}

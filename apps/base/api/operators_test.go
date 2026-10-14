package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"thom/api"
)

var operatorReadable = []string{"subject", "consent", "consentPolicy", "runtimePolicyDecision", "auditLog", "domain", "consentPurpose"}

func seedOperator(t *testing.T, h *harness, email, tenantID string) string {
	t.Helper()

	collection, err := h.app.FindCollectionByNameOrId("operators")
	if err != nil {
		t.Fatalf("operators collection: %v", err)
	}
	operator := core.NewRecord(collection)
	operator.SetEmail(email)
	operator.SetPassword("correct-horse-battery")
	operator.Set("tenantId", tenantID)
	if err := h.app.Save(operator); err != nil {
		t.Fatalf("save operator: %v", err)
	}

	rec := h.do(http.MethodPost, "/api/collections/operators/auth-with-password",
		`{"identity":"`+email+`","password":"correct-horse-battery"}`, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("operator login: %d %s", rec.Code, rec.Body.String())
	}
	token, _ := decode(t, rec)["token"].(string)
	return token
}

func seedTenantSubject(t *testing.T, h *harness, tenantID, externalID string) {
	t.Helper()

	collection, err := h.app.FindCollectionByNameOrId("subject")
	if err != nil {
		t.Fatal(err)
	}
	subject := core.NewRecord(collection)
	subject.Set("tenantId", tenantID)
	subject.Set("externalId", externalID)
	if err := h.app.Save(subject); err != nil {
		t.Fatal(err)
	}
}

func TestOperatorsReadOnlyTheirTenant(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	seedTenantSubject(t, h, "acme", "acme-visitor")
	seedTenantSubject(t, h, "globex", "globex-visitor")
	token := seedOperator(t, h, "ops@acme.example", "acme")

	rec := h.do(http.MethodGet, "/api/collections/subject/records", "", map[string]string{"Authorization": token})
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "acme-visitor") {
		t.Errorf("an operator must see their own tenant's subjects: %s", body)
	}
	if strings.Contains(body, "globex-visitor") {
		t.Errorf("an operator saw another tenant's subject: %s", body)
	}
}

func TestEveryConsentCollectionIsReadableByItsOperatorsOnly(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	token := seedOperator(t, h, "ops@acme.example", "acme")

	for _, name := range operatorReadable {
		t.Run(name, func(t *testing.T) {
			if rec := h.do(http.MethodGet, "/api/collections/"+name+"/records", "", map[string]string{"Authorization": token}); rec.Code != http.StatusOK {
				t.Errorf("operator list %s: %d, want 200: %s", name, rec.Code, rec.Body.String())
			}

			rec := h.do(http.MethodGet, "/api/collections/"+name+"/records", "", nil)
			if rec.Code == http.StatusOK && !strings.Contains(rec.Body.String(), `"items":[]`) {
				t.Errorf("anonymous list %s returned rows: %s", name, rec.Body.String())
			}
		})
	}
}

func TestOperatorsCannotWriteOrReadKeys(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	token := seedOperator(t, h, "ops@acme.example", "acme")
	auth := map[string]string{"Authorization": token}

	for _, name := range operatorReadable {
		rec := h.do(http.MethodPost, "/api/collections/"+name+"/records", `{"tenantId":"acme"}`, auth)
		if rec.Code != http.StatusForbidden {
			t.Errorf("operator create in %s: %d, want 403", name, rec.Code)
		}
	}

	rec := h.do(http.MethodGet, "/api/collections/apiKey/records", "", auth)
	if rec.Code != http.StatusForbidden {
		t.Errorf("operator list apiKey: %d, want 403: %s", rec.Code, rec.Body.String())
	}
}

func TestAnOperatorWithoutATenantSeesOnlyUntenantedRows(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	seedTenantSubject(t, h, "", "single-tenant-visitor")
	seedTenantSubject(t, h, "acme", "acme-visitor")
	token := seedOperator(t, h, "ops@example.com", "")

	body := h.do(http.MethodGet, "/api/collections/subject/records", "", map[string]string{"Authorization": token}).Body.String()
	if !strings.Contains(body, "single-tenant-visitor") || strings.Contains(body, "acme-visitor") {
		t.Errorf("single-tenant operator saw the wrong rows: %s", body)
	}
}

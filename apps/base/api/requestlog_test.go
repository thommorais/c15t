package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"thom/api"
)

func waitForLogs(t *testing.T, h *harness, until func([]*core.Log) bool) []*core.Log {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)
	for {
		var logs []*core.Log
		if err := h.app.LogQuery().All(&logs); err != nil {
			t.Fatalf("read logs: %v", err)
		}
		if until(logs) {
			return logs
		}
		if time.Now().After(deadline) {
			t.Fatalf("logs never settled: %d rows", len(logs))
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func TestRequestLogKeepsNoIdentifiers(t *testing.T) {
	h := newHarness(t, api.DefaultConfig())
	h.app.Settings().Logs.MaxDays = 5
	key := h.key()
	visitor := auth(key, "cf-ipcountry", "DE",
		"X-Forwarded-For", "203.0.113.7", "User-Agent", "TestAgent/1.0", "Referer", "https://shop.example/?email=someone@example.com")

	rec := h.do(http.MethodPost, "/api/c15t/consent",
		`{"givenAt":"2026-03-01T12:00:00Z","externalId":"user-42","domain":"example.com","categories":["necessary"]}`, visitor)
	subjectID, _ := decode(t, rec)["subjectId"].(string)
	h.do(http.MethodGet, "/api/c15t/consents/check?externalId=user-42&type=cookie_banner", "", visitor)
	h.do(http.MethodGet, "/api/c15t/subjects/"+subjectID, "", visitor)
	h.do(http.MethodGet, "/api/c15t/subjects?externalId=user-42", "", auth("c15t_test_sk_wrong"))

	h.do(http.MethodGet, "/api/health", "", nil)

	logs := waitForLogs(t, h, func(logs []*core.Log) bool {
		for _, l := range logs {
			if l.Data["url"] == "/api/health" {
				return true
			}
		}
		return false
	})

	var routes []string
	for _, l := range logs {
		raw, _ := l.Data.MarshalJSON()
		for _, leaked := range []string{"user-42", subjectID, "203.0.113", "TestAgent", "shop.example", "someone@example.com"} {
			if strings.Contains(string(raw), leaked) {
				t.Errorf("a log row holds %q: %s", leaked, raw)
			}
		}
		if route, ok := l.Data["route"].(string); ok {
			routes = append(routes, route)
		}
	}

	for _, want := range []string{
		"POST /api/c15t/consent",
		"GET /api/c15t/consents/check",
		"GET /api/c15t/subjects/{id}",
		"GET /api/c15t/subjects",
	} {
		found := false
		for _, route := range routes {
			found = found || route == want
		}
		if !found {
			t.Errorf("no request log for %s; got %v", want, routes)
		}
	}
}

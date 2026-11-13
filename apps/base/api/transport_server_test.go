package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"testing"

	"thom/api"
	"thom/core/apikey"
)

// The JS integration and browser suites run this test in an isolated test
// binary. No production endpoint or configuration exposes these credentials.
func TestGoTransportServer(t *testing.T) {
	path := os.Getenv("C15T_TEST_SERVER_FILE")
	if path == "" {
		t.Skip("used by JavaScript integration tests")
	}
	cfg := api.DefaultConfig()
	cfg.SnapshotSecret = "isolated-test-server-only"
	cfg.SnapshotRequired = true
	h := newHarness(t, cfg, os.Getenv("C15T_TEST_ORIGIN"))
	var requests sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Lock()
		defer requests.Unlock()
		// A local test control file changes the shown copy without adding an
		// administrative HTTP endpoint to the application or test server.
		if revision, err := os.ReadFile(path + ".revision"); err == nil {
			for i := range *cfg.PolicyRules {
				(*cfg.PolicyRules)[i].CopyRevision = string(revision)
			}
		}
		h.mux.ServeHTTP(w, r)
	}))
	t.Cleanup(server.Close)
	key := h.keyWithOrigins(apikey.ScopePublishable, os.Getenv("C15T_TEST_ORIGIN"))
	encoded, err := json.Marshal(map[string]string{"backendURL": server.URL + "/api/c15t", "apiKey": key, "secretKey": h.key()})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, encoded, 0600); err != nil {
		t.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
}

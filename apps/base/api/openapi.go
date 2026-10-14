package api

import (
	_ "embed"
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

//go:embed openapi.json
var openAPISpec []byte

// serveSpec needs no key: the document describes the API and holds no data.
func serveSpec(e *core.RequestEvent) error {
	return e.Blob(http.StatusOK, "application/json", openAPISpec)
}

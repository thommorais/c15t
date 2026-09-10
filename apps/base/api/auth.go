// Package api exposes the consent endpoints over PocketBase.
package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"thom/core/apikey"
)

type Tenant struct {
	ID       string
	KeyID    string
	KeyEnv   apikey.Env
	TenantID string
}

var errUnauthorized = errors.New("invalid or missing api key")

func authenticate(app core.App, r *http.Request) (*Tenant, error) {
	secret := apikey.ParseBearer(r.Header.Get("Authorization"))
	if secret == "" {
		return nil, errUnauthorized
	}
	if apikey.EnvOf(secret) == "" {
		return nil, errUnauthorized
	}

	record, err := app.FindFirstRecordByFilter(
		"apiKey",
		"keyHash = {:hash} && revoked = false",
		dbx.Params{"hash": apikey.Hash(secret)},
	)
	if err != nil || record == nil {
		return nil, errUnauthorized
	}

	if !apikey.Verify(secret, record.GetString("keyHash")) {
		return nil, errUnauthorized
	}

	return &Tenant{
		ID:       record.Id,
		KeyID:    record.Id,
		KeyEnv:   apikey.Env(record.GetString("env")),
		TenantID: record.GetString("tenantId"),
	}, nil
}

func touchKeyUsage(app core.App, keyID string) {
	record, err := app.FindRecordById("apiKey", keyID)
	if err != nil {
		return
	}
	record.Set("lastUsedAt", time.Now().UTC())
	_ = app.SaveNoValidate(record)
}

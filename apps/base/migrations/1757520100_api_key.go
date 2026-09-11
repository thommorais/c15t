package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const idAPIKey = "clxapikey000000"

func init() {
	m.Register(func(app core.App) error {
		return app.Save(apiKeyCollection())
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("apiKey")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	})
}

func apiKeyCollection() *core.Collection {
	c := core.NewBaseCollection("apiKey", idAPIKey)
	c.Fields.Add(
		&core.TextField{Name: "name", Max: 255},
		&core.TextField{Name: "keyHash", Required: true, Max: 64},
		&core.TextField{Name: "env", Required: true, Max: 8},
		&core.TextField{Name: "scope", Required: true, Max: 16},
		&core.BoolField{Name: "revoked"},
		&core.DateField{Name: "lastUsedAt"},
		createdField(),
		updatedField(),
	)
	c.Indexes = []string{
		`CREATE UNIQUE INDEX idx_apikey_hash ON apiKey (keyHash)`,
		`CREATE INDEX idx_apikey_revoked ON apiKey (revoked)`,
	}

	return c
}

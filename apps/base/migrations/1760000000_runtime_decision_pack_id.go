package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// packId records which configured policy pack applied. The fingerprint already
// identifies the content; this names it for a person reading the row.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("runtimePolicyDecision")
		if err != nil {
			return err
		}
		collection.Fields.Add(&core.TextField{Name: "packId", Max: 255})
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("runtimePolicyDecision")
		if err != nil {
			return nil
		}
		collection.Fields.RemoveByName("packId")
		return app.Save(collection)
	})
}

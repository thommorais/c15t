package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// erasedAt marks a subject whose identity was removed on request. With the
// externalId cleared the row looks unlinked, and only this keeps it from
// being linked again.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("subject")
		if err != nil {
			return err
		}
		collection.Fields.Add(&core.DateField{Name: "erasedAt"})
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("subject")
		if err != nil {
			return nil
		}
		collection.Fields.RemoveByName("erasedAt")
		return app.Save(collection)
	})
}

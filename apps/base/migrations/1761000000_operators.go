package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Operators read their tenant's consent data in the dashboard through
// PocketBase's record API. They never write there: every change goes through
// /api/c15t and its keys, so no create, update or delete rule is set, and
// apiKey stays superuser only.
var operatorReadable = []string{"subject", "consent", "consentPolicy", "runtimePolicyDecision", "auditLog", "domain", "consentPurpose"}

const operatorReadRule = `@request.auth.collectionName = "operators" && @request.auth.tenantId = tenantId`

func init() {
	m.Register(func(app core.App) error {
		operators := core.NewAuthCollection("operators")
		operators.Fields.Add(&core.TextField{Name: "tenantId", Max: 255})
		operators.ViewRule = types.Pointer("id = @request.auth.id")
		if err := app.Save(operators); err != nil {
			return err
		}

		for _, name := range operatorReadable {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			collection.ListRule = types.Pointer(operatorReadRule)
			collection.ViewRule = types.Pointer(operatorReadRule)
			if err := app.Save(collection); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		for _, name := range operatorReadable {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				continue
			}
			collection.ListRule = nil
			collection.ViewRule = nil
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		operators, err := app.FindCollectionByNameOrId("operators")
		if err != nil {
			return nil
		}
		return app.Delete(operators)
	})
}

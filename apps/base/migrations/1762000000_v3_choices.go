package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		fields := map[string][]core.Field{
			"consent":               {&core.JSONField{Name: "choice", MaxSize: 65536}},
			"runtimePolicyDecision": {&core.JSONField{Name: "policyResolution", MaxSize: 65536}},
			"subject":               {&core.TextField{Name: "clientId", Max: 128}, &core.TextField{Name: "recordTokenHash", Max: 64}},
		}
		for name, additions := range fields {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			collection.Fields.Add(additions...)
			if name == "subject" {
				collection.Indexes = append(collection.Indexes, `CREATE UNIQUE INDEX idx_subject_client ON subject (tenantId, clientId) WHERE clientId != ''`)
			}
			if err := app.Save(collection); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		for name, fields := range map[string][]string{"consent": {"choice"}, "runtimePolicyDecision": {"policyResolution"}, "subject": {"clientId", "recordTokenHash"}} {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			for _, field := range fields {
				collection.Fields.RemoveByName(field)
			}
			if name == "subject" {
				collection.RemoveIndex("idx_subject_client")
			}
			if err := app.Save(collection); err != nil {
				return err
			}
		}
		return nil
	})
}

package api

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"thom/core/erasure"
)

type eraseRequest struct {
	ExternalID string `json:"externalId"`
}

type eraseResult struct {
	Subjects int `json:"subjects"`
	Consents int `json:"consents"`
}

// eraseSubject anonymises every subject linked to an externalId, one per
// device and identity provider. The externalId comes in the body so it never
// reaches the request log's URI.
func (h *Handler) eraseSubject(c *Ctx, body eraseRequest) (eraseResult, error) {
	if body.ExternalID == "" {
		return eraseResult{}, BadRequest(codeInputValidationFailed, "externalId is required")
	}

	var result eraseResult
	err := c.DB().Tx(func(tx *scope) error {
		result = eraseResult{}

		subjects, err := tx.FindAll("subject", "externalId = {:ext}", "", 0, 0, dbx.Params{"ext": body.ExternalID})
		if err != nil {
			return err
		}

		erased := make([]string, 0, len(subjects))
		for _, subject := range subjects {
			for _, collection := range []string{"consent", "auditLog"} {
				rows, err := tx.FindAll(collection, "subject = {:id}", "", 0, 0, dbx.Params{"id": subject.Id})
				if err != nil {
					return err
				}
				for _, row := range rows {
					if err := scrubRecord(tx, row); err != nil {
						return err
					}
				}
				if collection == "consent" {
					result.Consents += len(rows)
				}
			}

			subject.Set("erasedAt", types.NowDateTime())
			if err := scrubRecord(tx, subject); err != nil {
				return err
			}
			erased = append(erased, subject.Id)
		}
		result.Subjects = len(erased)

		if len(erased) == 0 {
			return nil
		}

		entry, err := tx.New("auditLog")
		if err != nil {
			return err
		}
		entry.Set("entityType", "erasure")
		entry.Set("entityId", core.GenerateDefaultRandomId())
		entry.Set("actionType", "anonymise")
		entry.Set("changes", map[string]any{
			"subjects": erased,
			"consents": result.Consents,
		})
		return tx.Save(entry)
	})
	if err != nil {
		return eraseResult{}, err
	}

	return result, nil
}

func scrubRecord(tx *scope, record *core.Record) error {
	collection := record.Collection()

	current := map[string]any{}
	for _, name := range erasure.PersonalFields(collection.Name) {
		if field := collection.Fields.GetByName(name); field != nil && field.Type() == core.FieldTypeJSON {
			var value any
			if err := record.UnmarshalJSONField(name, &value); err != nil {
				return err
			}
			current[name] = value
			continue
		}
		current[name] = record.Get(name)
	}

	for name, value := range erasure.Scrub(collection.Name, current) {
		record.Set(name, value)
	}
	return tx.Save(record)
}

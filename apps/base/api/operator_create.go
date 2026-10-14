package api

import "github.com/pocketbase/pocketbase/core"

// CreateOperator adds a dashboard account bound to a tenant. It goes through
// a scope for that tenant, so the account is stamped like every tenant row.
// PocketBase's own validation applies: a malformed email, a short password or
// a taken email is refused.
func CreateOperator(app core.App, email, password, tenantID string) error {
	db := &scope{app: app, tenant: tenantID}

	operator, err := db.New("operators")
	if err != nil {
		return err
	}
	operator.SetEmail(email)
	operator.SetPassword(password)
	return db.Save(operator)
}

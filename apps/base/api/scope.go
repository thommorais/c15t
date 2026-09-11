package api

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// tenantParam is deliberately obscure so it cannot collide with a caller's own
// binding.
const tenantParam = "__tenant"

// unscoped collections carry no tenantId: they describe the instance itself
// rather than a client's data.
var unscoped = map[string]bool{
	"apiKey": true,
}

func isUnscoped(collection string) bool {
	return unscoped[collection]
}

func scopeFilter(filter string) string {
	clause := "tenantId = {:" + tenantParam + "}"

	if strings.Contains(filter, tenantParam) {
		return filter
	}
	if strings.TrimSpace(filter) == "" {
		return clause
	}

	return "(" + filter + ") && " + clause
}

func scopeParams(params dbx.Params, tenantID string) dbx.Params {
	scoped := dbx.Params{}
	for k, v := range params {
		scoped[k] = v
	}
	scoped[tenantParam] = tenantID

	return scoped
}

// scope is the only way handlers should reach the database. Every read carries
// the instance's tenant and every write is stamped with it, so a forgotten
// filter cannot expose another deployment's rows.
type scope struct {
	app    core.App
	tenant string
}

func (c *Ctx) DB() *scope {
	return &scope{app: c.Handler.app, tenant: c.TenantID()}
}

// with returns the same scope bound to a transaction's app.
func (s *scope) with(app core.App) *scope {
	return &scope{app: app, tenant: s.tenant}
}

// A deployment with no configured tenant owns its whole database, so scoping
// would only filter rows it already owns. This mirrors the reference, which
// uses the raw ORM when tenantId is unset.
func (s *scope) skip(collection string) bool {
	return s.tenant == "" || isUnscoped(collection)
}

func (s *scope) FindFirst(collection, filter string, params dbx.Params) (*core.Record, error) {
	if s.skip(collection) {
		return s.app.FindFirstRecordByFilter(collection, filter, params)
	}

	return s.app.FindFirstRecordByFilter(
		collection,
		scopeFilter(filter),
		scopeParams(params, s.tenant),
	)
}

func (s *scope) FindAll(collection, filter, sort string, limit, offset int, params dbx.Params) ([]*core.Record, error) {
	if s.skip(collection) {
		return s.app.FindRecordsByFilter(collection, filter, sort, limit, offset, params)
	}

	return s.app.FindRecordsByFilter(
		collection,
		scopeFilter(filter),
		sort,
		limit,
		offset,
		scopeParams(params, s.tenant),
	)
}

// FindByID rejects a record belonging to another tenant rather than returning
// it, so an id guessed or leaked from elsewhere is not a way in.
func (s *scope) FindByID(collection, id string) (*core.Record, error) {
	record, err := s.app.FindRecordById(collection, id)
	if err != nil {
		return nil, err
	}
	if !s.skip(collection) && record.GetString("tenantId") != s.tenant {
		return nil, errNotOwned
	}

	return record, nil
}

// New returns a record already stamped with the tenant.
func (s *scope) New(collection string) (*core.Record, error) {
	c, err := s.app.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(c)
	if !s.skip(collection) {
		record.Set("tenantId", s.tenant)
	}

	return record, nil
}

func (s *scope) Save(record *core.Record) error {
	return s.app.Save(record)
}

// Tx runs fn with a scope bound to the transaction, so work inside a
// transaction cannot escape tenant scoping either.
func (s *scope) Tx(fn func(tx *scope) error) error {
	return s.app.RunInTransaction(func(txApp core.App) error {
		return fn(s.with(txApp))
	})
}

package api

import (
	"errors"
	"net/http"

	"github.com/pocketbase/pocketbase/core"

	"thom/core/consent"
)

type Ctx struct {
	Handler *Handler
	Event   *core.RequestEvent
	Tenant  *Tenant
}

func (c *Ctx) App() core.App { return c.Handler.app }

// TenantID is instance configuration, not request state.
func (c *Ctx) TenantID() string { return c.Handler.cfg.TenantID }

func (c *Ctx) Query(name string) string {
	return c.Event.Request.URL.Query().Get(name)
}

func (c *Ctx) Path(name string) string {
	return c.Event.Request.PathValue(name)
}

// Status is returned by a handler to override the default 200.
type Status struct {
	Code int
	Body any
}

// Fail carries an HTTP status alongside the error so handlers can choose one
// without reaching for the framework's error helpers.
type Fail struct {
	Code    int
	Message string
	Err     error
}

func (f *Fail) Error() string { return f.Message }
func (f *Fail) Unwrap() error { return f.Err }

func BadRequest(message string) error {
	return &Fail{Code: http.StatusBadRequest, Message: message}
}

func Unprocessable(message string) error {
	return &Fail{Code: http.StatusUnprocessableEntity, Message: message}
}

func Conflict(message string) error {
	return &Fail{Code: http.StatusConflict, Message: message}
}

func NotFound(message string) error {
	return &Fail{Code: http.StatusNotFound, Message: message}
}

func Unavailable(message string, err error) error {
	return &Fail{Code: http.StatusServiceUnavailable, Message: message, Err: err}
}

// handle wraps a handler with authentication, error mapping and JSON encoding.
// Endpoints that need no request body use `any` for B.
func handle[B any, R any](h *Handler, fn func(*Ctx, B) (R, error)) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		tenant, err := authenticate(h.app, e.Request)
		if err != nil {
			return e.UnauthorizedError("invalid or missing api key", nil)
		}

		var body B
		if needsBody(e.Request.Method) {
			if err := e.BindBody(&body); err != nil {
				return e.BadRequestError("malformed request body", err)
			}
		}

		result, err := fn(&Ctx{Handler: h, Event: e, Tenant: tenant}, body)
		if err != nil {
			return respondError(e, err)
		}

		touchKeyUsage(h.app, tenant.KeyID)

		if status, ok := any(result).(Status); ok {
			return e.JSON(status.Code, status.Body)
		}

		return e.JSON(http.StatusOK, result)
	}
}

func needsBody(method string) bool {
	return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch
}

func respondError(e *core.RequestEvent, err error) error {
	var fail *Fail
	if errors.As(err, &fail) {
		return e.Error(fail.Code, fail.Message, nil)
	}

	if consent.IsInvalid(err) || errors.Is(err, errInvalidInput) {
		return e.BadRequestError(err.Error(), nil)
	}

	return e.InternalServerError("request failed", err)
}

package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"thom/core/apikey"
	"thom/core/consent"
	"thom/core/request"
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

// Fail carries an HTTP status and a stable error code so handlers can choose
// both without reaching for the framework's error helpers.
type Fail struct {
	Status  int
	Code    string
	Message string
	Err     error
}

func (f *Fail) Error() string { return f.Message }
func (f *Fail) Unwrap() error { return f.Err }

func BadRequest(code, message string) error {
	return &Fail{Status: http.StatusBadRequest, Code: code, Message: message}
}

func Unprocessable(code, message string) error {
	return &Fail{Status: http.StatusUnprocessableEntity, Code: code, Message: message}
}

func Conflict(code, message string) error {
	return &Fail{Status: http.StatusConflict, Code: code, Message: message}
}

func NotFound(code, message string) error {
	return &Fail{Status: http.StatusNotFound, Code: code, Message: message}
}

func Unavailable(code, message string, err error) error {
	return &Fail{Status: http.StatusServiceUnavailable, Code: code, Message: message, Err: err}
}

// handle wraps a handler with authentication, error mapping and JSON encoding.
// Endpoints that need no request body use `any` for B.
func handle[B any, R any](h *Handler, need apikey.Scope, fn func(*Ctx, B) (R, error)) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		tenant, err := authenticate(h.app, e.Request)
		if err != nil {
			return writeError(e, http.StatusUnauthorized, codeUnauthorized, msgUnauthorized)
		}

		// A publishable key ships in a browser bundle, so it must never reach
		// an endpoint that reads or rewrites stored personal data.
		if !tenant.Scope.Allows(need) {
			return writeError(e, http.StatusForbidden, codeForbidden, "This endpoint requires a secret API key")
		}

		// A publishable key is copyable, so it is only usable from the sites it
		// was issued for. Secret keys are server side and carry no Origin.
		if tenant.Scope == apikey.ScopePublishable {
			if o := e.Request.Header.Get("Origin"); !tenant.Origins.Allows(o) {
				return writeError(e, http.StatusForbidden, codeForbidden, "Origin not allowed for this API key")
			}
		}

		limiter := h.limiterFor(e.Request.Method, e.Request.URL.Path)
		bucket := tenant.KeyID + "|" + rateAddress(e.Request)

		if now := time.Now(); !limiter.Allow(bucket, now) {
			retry := limiter.RetryAfter(bucket, now)
			e.Response.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retry.Seconds()))))
			return writeError(e, http.StatusTooManyRequests, codeRateLimited, "Rate limit exceeded")
		}

		var body B
		if needsBody(e.Request.Method) {
			if err := e.BindBody(&body); err != nil {
				e.App.Logger().Debug("malformed request body", "error", err)
				return writeError(e, http.StatusBadRequest, codeInputValidationFailed, "Malformed request body")
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

var rateSalt = func() []byte {
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		panic(err)
	}
	return salt
}()

// rateAddress identifies a caller to the limiter without keeping the address.
// The IP tracking and masking options govern what is stored, and a masked or
// empty address would put unrelated callers of one key in a single bucket. The
// address is therefore read raw but only its keyed hash is held, under a salt
// that exists only in this process, so the limiter never holds an address and
// the bucket names cannot be reversed after a restart.
func rateAddress(r *http.Request) string {
	addr := request.ClientIP(r.Header, request.IPOptions{DisableMasking: true})
	if addr == "" {
		addr = r.RemoteAddr
		if host, _, err := net.SplitHostPort(addr); err == nil {
			addr = host
		}
	}

	mac := hmac.New(sha256.New, rateSalt)
	mac.Write([]byte(addr))
	return hex.EncodeToString(mac.Sum(nil)[:16])
}

// requireQuery separates a parameter that is absent from one that is present
// and empty, as the reference does: the first fails schema validation (400),
// the second reaches the handler, which answers 422 with the parameter's code.
func requireQuery(c *Ctx, name, code string) error {
	query := c.Event.Request.URL.Query()
	if !query.Has(name) {
		return BadRequest(codeInputValidationFailed, name+" query parameter is required")
	}
	if query.Get(name) == "" {
		return Unprocessable(code, name+" query parameter is required")
	}
	return nil
}

func notFound(e *core.RequestEvent) error {
	return writeError(e, http.StatusNotFound, codeNotFound, "Not Found")
}

func needsBody(method string) bool {
	return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch
}

type errorEnvelope struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Status  int            `json:"status"`
	Defined bool           `json:"defined"`
	Data    map[string]any `json:"data"`
}

func writeError(e *core.RequestEvent, status int, code, message string) error {
	return e.JSON(status, errorEnvelope{
		Code:    code,
		Message: message,
		Status:  status,
		Defined: true,
		Data:    map[string]any{},
	})
}

func respondError(e *core.RequestEvent, err error) error {
	var fail *Fail
	if errors.As(err, &fail) {
		if fail.Status >= http.StatusInternalServerError {
			e.App.Logger().Error(fail.Message, "error", fail.Err)
		}
		return writeError(e, fail.Status, fail.Code, fail.Message)
	}

	if consent.IsOutOfScope(err) {
		return writeError(e, http.StatusBadRequest, codePurposeNotAllowed, msgPurposeNotAllowed)
	}

	if consent.IsInvalid(err) || errors.Is(err, errInvalidInput) {
		return writeError(e, http.StatusBadRequest, codeInputValidationFailed, err.Error())
	}

	e.App.Logger().Error("request failed", "error", err)
	return writeError(e, http.StatusInternalServerError, codeInternalServerError, msgInternalServerError)
}

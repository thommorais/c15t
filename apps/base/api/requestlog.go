package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

const requestLogID = "c15tRequestLog"

// requestLog replaces PocketBase's request logger on every route. That one
// stores the full URI, referer, user agent and IP for days, which here means
// externalIds, subject ids, record filters and addresses outside the reach of
// erasure, on the c15t routes and on the record API the dashboard reads. This
// keeps only what operating the service needs: the route pattern, never the
// path or query that was requested.
func requestLog() *hook.Handler[*core.RequestEvent] {
	return &hook.Handler[*core.RequestEvent]{
		Id: requestLogID,
		Func: func(e *core.RequestEvent) error {
			started := time.Now()
			err := e.Next()

			status := e.Status()
			level := slog.LevelInfo
			if status >= http.StatusInternalServerError || (status == 0 && err != nil) {
				level = slog.LevelError
			}

			e.App.Logger().Log(e.Request.Context(), level, "request",
				slog.String("type", "request"),
				slog.String("route", e.Request.Pattern),
				slog.Int("status", status),
				slog.Float64("execTime", float64(time.Since(started))/float64(time.Millisecond)),
			)
			return err
		},
	}
}

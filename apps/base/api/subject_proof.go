package api

import (
	"crypto/subtle"
	"regexp"

	"github.com/pocketbase/pocketbase/core"
	"thom/core/apikey"
)

var clientSubjectID = regexp.MustCompile(`^[A-Za-z0-9_-]{15,128}$`)
var subjectSecret = regexp.MustCompile(`^[a-f0-9]{64}$`)

// A publishable key authenticates the site, not the visitor. Browser record
// reads additionally require the secret that created this particular subject.
func requireSubjectProof(c *Ctx, record *core.Record, token string, required bool) error {
	if c.Tenant.Scope == apikey.ScopeSecret {
		return nil
	}
	want := record.GetString("recordTokenHash")
	if !required && want == "" {
		return nil
	}
	if !record.GetDateTime("erasedAt").IsZero() || want == "" || !subjectSecret.MatchString(token) || subtle.ConstantTimeCompare([]byte(want), []byte(apikey.Hash(token))) != 1 {
		return Forbidden("Subject proof is required")
	}
	return nil
}

func (h *Handler) getSubjectRecord(c *Ctx, _ any) (subjectPayload, error) {
	record, err := c.DB().FindByID("subject", c.Path("id"))
	if err != nil {
		if isMissing(err) {
			return subjectPayload{}, NotFound(codeSubjectNotFound, "Subject not found")
		}
		return subjectPayload{}, err
	}
	if err := requireSubjectProof(c, record, c.Event.Request.Header.Get("X-C15T-Subject-Token"), true); err != nil {
		return subjectPayload{}, err
	}
	c.Event.Response.Header().Set("Cache-Control", "no-store")
	return h.getSubject(c, nil)
}

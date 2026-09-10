package consent

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
)

// MaxFutureDrift is how far ahead of server time a client-supplied consent
// time may be before it is treated as a bad clock.
const MaxFutureDrift = 5 * time.Minute

// Submission identifies one consent submission. Two requests carrying the same
// values are the same submission, not two consents.
type Submission struct {
	TenantID   string
	SubjectID  string
	DomainID   string
	PolicyType string
	GivenAt    time.Time
}

func SubmissionKey(s Submission) string {
	parts := strings.Join([]string{
		s.TenantID,
		s.SubjectID,
		s.DomainID,
		s.PolicyType,
		s.GivenAt.UTC().Format(time.RFC3339Nano),
	}, "\x1f")

	sum := sha256.Sum256([]byte(parts))
	return hex.EncodeToString(sum[:])
}

// ClampGivenAt keeps a client's timestamp unless it is implausibly far ahead of
// server time. Past times survive so an offline submission records when the
// subject actually chose, rather than when the queue drained.
func ClampGivenAt(given *time.Time, now time.Time) time.Time {
	if given == nil {
		return now
	}
	if given.After(now.Add(MaxFutureDrift)) {
		return now
	}
	return *given
}

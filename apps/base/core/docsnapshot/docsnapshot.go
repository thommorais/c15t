// Package docsnapshot signs and verifies legal-document snapshot tokens: proof
// of which release of a document (type, version, hash, effective date) a
// visitor was shown. They are issued by whatever renders the document and share
// a secret with this backend.
package docsnapshot

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const (
	DefaultIssuer   = "c15t"
	DefaultAudience = "c15t-legal-document-snapshot"
	DefaultTTL      = 30 * time.Minute
)

type FailureReason string

const (
	ReasonMissing   FailureReason = "missing"
	ReasonMalformed FailureReason = "malformed"
	ReasonExpired   FailureReason = "expired"
	ReasonInvalid   FailureReason = "invalid"
)

type Error struct {
	Reason FailureReason
}

func (e *Error) Error() string {
	switch e.Reason {
	case ReasonMissing:
		return "legal document snapshot token is required"
	case ReasonExpired:
		return "legal document snapshot token has expired"
	default:
		return "legal document snapshot token is invalid"
	}
}

// ReasonOf extracts the failure reason from an error returned by Verify.
func ReasonOf(err error) (FailureReason, bool) {
	var e *Error
	if errors.As(err, &e) {
		return e.Reason, true
	}
	return "", false
}

type Payload struct {
	Issuer        string `json:"iss"`
	Audience      string `json:"aud"`
	Subject       string `json:"sub"`
	TenantID      string `json:"tenantId,omitempty"`
	Type          string `json:"type"`
	Version       string `json:"version"`
	Hash          string `json:"hash"`
	EffectiveDate string `json:"effectiveDate"`
	IssuedAt      int64  `json:"iat"`
	ExpiresAt     int64  `json:"exp"`
}

type Signer struct {
	secret   []byte
	issuer   string
	audience string
	ttl      time.Duration
}

func NewSigner(secret, issuer, audience string, ttl time.Duration) *Signer {
	if issuer == "" {
		issuer = DefaultIssuer
	}
	if ttl <= 0 {
		ttl = DefaultTTL
	}

	return &Signer{secret: []byte(secret), issuer: issuer, audience: audience, ttl: ttl}
}

// audienceFor appends the tenant to the default audience only. A configured
// audience is used as written, so the renderer and this backend can agree on
// one value.
func (s *Signer) audienceFor(tenantID string) string {
	if s.audience != "" {
		return s.audience
	}
	if tenantID == "" {
		return DefaultAudience
	}
	return DefaultAudience + ":" + tenantID
}

func (s *Signer) Sign(p Payload, now time.Time) (string, error) {
	p.Issuer = s.issuer
	p.Audience = s.audienceFor(p.TenantID)
	p.Subject = p.Hash
	p.IssuedAt = now.Unix()
	p.ExpiresAt = now.Add(s.ttl).Unix()

	header, err := encodeSegment(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}

	body, err := encodeSegment(p)
	if err != nil {
		return "", err
	}

	signing := header + "." + body
	return signing + "." + base64.RawURLEncoding.EncodeToString(s.mac(signing)), nil
}

func (s *Signer) Verify(token, tenantID string, now time.Time) (*Payload, error) {
	if token == "" {
		return nil, &Error{Reason: ReasonMissing}
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, &Error{Reason: ReasonMalformed}
	}

	var header struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
	}
	if err := decodeSegment(parts[0], &header); err != nil {
		return nil, &Error{Reason: ReasonMalformed}
	}
	if header.Alg != "HS256" || header.Typ != "JWT" {
		return nil, &Error{Reason: ReasonInvalid}
	}

	actual, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, &Error{Reason: ReasonMalformed}
	}
	if !hmac.Equal(s.mac(parts[0]+"."+parts[1]), actual) {
		return nil, &Error{Reason: ReasonInvalid}
	}

	var p Payload
	if err := decodeSegment(parts[1], &p); err != nil {
		return nil, &Error{Reason: ReasonMalformed}
	}

	if p.Issuer != s.issuer || p.Audience != s.audienceFor(tenantID) {
		return nil, &Error{Reason: ReasonInvalid}
	}
	if p.Type == "" || p.Version == "" || p.Hash == "" || p.EffectiveDate == "" || p.Subject != p.Hash {
		return nil, &Error{Reason: ReasonInvalid}
	}
	if p.TenantID != tenantID {
		return nil, &Error{Reason: ReasonInvalid}
	}
	if p.ExpiresAt <= now.Unix() {
		return nil, &Error{Reason: ReasonExpired}
	}

	return &p, nil
}

func (s *Signer) mac(signing string) []byte {
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(signing))
	return m.Sum(nil)
}

func encodeSegment(v any) (string, error) {
	encoded, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(encoded), nil
}

func decodeSegment(segment string, out any) error {
	decoded, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil {
		return err
	}
	return json.Unmarshal(decoded, out)
}

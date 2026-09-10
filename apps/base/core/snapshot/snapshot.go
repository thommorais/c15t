// Package snapshot signs and verifies the policy token that ties a consent
// write to the exact policy the client was shown.
package snapshot

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
	DefaultAudience = "c15t-policy-snapshot"
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
		return "policy snapshot token is required"
	case ReasonExpired:
		return "policy snapshot token has expired"
	default:
		return "policy snapshot token is invalid"
	}
}

func ReasonOf(err error) (FailureReason, bool) {
	var e *Error
	if errors.As(err, &e) {
		return e.Reason, true
	}
	return "", false
}

type Payload struct {
	Issuer       string `json:"iss"`
	Audience     string `json:"aud"`
	Subject      string `json:"sub"`
	TenantID     string `json:"tenantId,omitempty"`
	PolicyID     string `json:"policyId"`
	Fingerprint  string `json:"fingerprint"`
	MatchedBy    string `json:"matchedBy"`
	Country      string `json:"country,omitempty"`
	Region       string `json:"region,omitempty"`
	Jurisdiction string `json:"jurisdiction"`
	Language     string `json:"language,omitempty"`
	Model        string `json:"model"`
	PolicyI18n   any    `json:"policyI18n,omitempty"`

	ExpiryDays            *int     `json:"expiryDays,omitempty"`
	ScopeMode             string   `json:"scopeMode,omitempty"`
	Categories            []string `json:"categories,omitempty"`
	PreselectedCategories []string `json:"preselectedCategories,omitempty"`
	GPC                   *bool    `json:"gpc,omitempty"`

	UIMode      string `json:"uiMode,omitempty"`
	BannerUI    any    `json:"bannerUi,omitempty"`
	DialogUI    any    `json:"dialogUi,omitempty"`
	ProofConfig any    `json:"proofConfig,omitempty"`

	IssuedAt  int64 `json:"iat"`
	ExpiresAt int64 `json:"exp"`
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
	if audience == "" {
		audience = DefaultAudience
	}
	if ttl <= 0 {
		ttl = DefaultTTL
	}

	return &Signer{
		secret:   []byte(secret),
		issuer:   issuer,
		audience: audience,
		ttl:      ttl,
	}
}

// Audience is scoped per tenant so a token minted for one tenant cannot be
// replayed against another.
func (s *Signer) audienceFor(tenantID string) string {
	if tenantID == "" {
		return s.audience
	}
	return s.audience + ":" + tenantID
}

func (s *Signer) Sign(p Payload, now time.Time) (string, error) {
	p.Issuer = s.issuer
	p.Audience = s.audienceFor(p.TenantID)
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

	expected := s.mac(parts[0] + "." + parts[1])
	actual, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, &Error{Reason: ReasonMalformed}
	}
	if !hmac.Equal(expected, actual) {
		return nil, &Error{Reason: ReasonInvalid}
	}

	var p Payload
	if err := decodeSegment(parts[1], &p); err != nil {
		return nil, &Error{Reason: ReasonMalformed}
	}

	if p.Issuer != s.issuer || p.Audience != s.audienceFor(tenantID) {
		return nil, &Error{Reason: ReasonInvalid}
	}
	if p.PolicyID == "" || p.Fingerprint == "" {
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

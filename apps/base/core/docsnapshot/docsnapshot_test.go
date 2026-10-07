package docsnapshot

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

var now = time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

func payload() Payload {
	return Payload{
		Type:          "privacy_policy",
		Version:       "2026-01-01",
		Hash:          "sha256:abc",
		EffectiveDate: "2026-01-01T00:00:00.000Z",
	}
}

func reasonOf(t *testing.T, err error) FailureReason {
	t.Helper()

	var failure *Error
	if !errors.As(err, &failure) {
		t.Fatalf("error = %v, want a *Error", err)
	}
	return failure.Reason
}

func TestSignAndVerify(t *testing.T) {
	signer := NewSigner("secret", "", "", 0)

	token, err := signer.Sign(payload(), now)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if len(strings.Split(token, ".")) != 3 {
		t.Fatalf("token = %q, want three segments", token)
	}

	got, err := signer.Verify(token, "", now.Add(time.Minute))
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}

	if got.Type != "privacy_policy" || got.Version != "2026-01-01" || got.Hash != "sha256:abc" ||
		got.EffectiveDate != "2026-01-01T00:00:00.000Z" {
		t.Errorf("payload = %+v", got)
	}
	if got.Subject != got.Hash {
		t.Errorf("sub = %q, want the hash %q", got.Subject, got.Hash)
	}
	if got.Issuer != DefaultIssuer || got.Audience != DefaultAudience {
		t.Errorf("iss = %q aud = %q, want the defaults", got.Issuer, got.Audience)
	}
	if got.ExpiresAt != now.Add(DefaultTTL).Unix() {
		t.Errorf("exp = %d, want the default ttl", got.ExpiresAt)
	}
}

func TestAudienceIsTenantScopedOnlyWhenDefaulted(t *testing.T) {
	in := payload()
	in.TenantID = "acme"

	defaulted := NewSigner("secret", "", "", 0)
	token, _ := defaulted.Sign(in, now)
	got, err := defaulted.Verify(token, "acme", now)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.Audience != DefaultAudience+":acme" {
		t.Errorf("aud = %q, want the default with the tenant appended", got.Audience)
	}

	configured := NewSigner("secret", "", "docs.example", 0)
	token, _ = configured.Sign(in, now)
	got, err = configured.Verify(token, "acme", now)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.Audience != "docs.example" {
		t.Errorf("aud = %q, want the configured audience verbatim", got.Audience)
	}
}

func TestVerifyFailures(t *testing.T) {
	signer := NewSigner("secret", "", "", 0)
	good, _ := signer.Sign(payload(), now)

	forge := func(mutate func(map[string]any)) string {
		parts := strings.Split(good, ".")
		raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		mutate(body)
		encoded, _ := json.Marshal(body)
		forged := parts[0] + "." + base64.RawURLEncoding.EncodeToString(encoded)
		return forged + "." + base64.RawURLEncoding.EncodeToString(signer.mac(forged))
	}

	tests := []struct {
		name  string
		token string
		at    time.Time
		want  FailureReason
	}{
		{name: "empty", token: "", at: now, want: ReasonMissing},
		{name: "two segments", token: "a.b", at: now, want: ReasonMalformed},
		{name: "not base64", token: "!!.!!.!!", at: now, want: ReasonMalformed},
		{name: "another secret", token: mustSign(NewSigner("other", "", "", 0)), at: now, want: ReasonInvalid},
		{name: "expired", token: good, at: now.Add(DefaultTTL + time.Second), want: ReasonExpired},
		{name: "expiry second is expired", token: good, at: now.Add(DefaultTTL), want: ReasonExpired},
		{name: "other issuer", token: mustSign(NewSigner("secret", "someone", "", 0)), at: now, want: ReasonInvalid},
		{name: "other audience", token: mustSign(NewSigner("secret", "", "elsewhere", 0)), at: now, want: ReasonInvalid},
		{name: "subject is not the hash", token: forge(func(b map[string]any) { b["sub"] = "other" }), at: now, want: ReasonInvalid},
		{name: "missing type", token: forge(func(b map[string]any) { delete(b, "type") }), at: now, want: ReasonInvalid},
		{name: "missing version", token: forge(func(b map[string]any) { delete(b, "version") }), at: now, want: ReasonInvalid},
		{name: "missing hash", token: forge(func(b map[string]any) { delete(b, "hash"); b["sub"] = "" }), at: now, want: ReasonInvalid},
		{name: "missing effective date", token: forge(func(b map[string]any) { delete(b, "effectiveDate") }), at: now, want: ReasonInvalid},
		{name: "tenant in a token minted without one", token: forge(func(b map[string]any) { b["tenantId"] = "acme" }), at: now, want: ReasonInvalid},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := signer.Verify(tt.token, "", tt.at)
			if got := reasonOf(t, err); got != tt.want {
				t.Errorf("reason = %q, want %q", got, tt.want)
			}
		})
	}
}

func mustSign(s *Signer) string {
	token, err := s.Sign(payload(), now)
	if err != nil {
		panic(err)
	}
	return token
}

func TestVerifyRejectsAnotherTenant(t *testing.T) {
	in := payload()
	in.TenantID = "acme"

	signer := NewSigner("secret", "", "", 0)
	token, _ := signer.Sign(in, now)

	if _, err := signer.Verify(token, "other", now); reasonOf(t, err) != ReasonInvalid {
		t.Errorf("a token for acme verified for another tenant: %v", err)
	}
	if _, err := signer.Verify(token, "", now); reasonOf(t, err) != ReasonInvalid {
		t.Errorf("a tenant token verified on an instance with no tenant: %v", err)
	}
}

func TestVerifyRejectsAlgNone(t *testing.T) {
	signer := NewSigner("secret", "", "", 0)

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	body, _ := json.Marshal(map[string]any{
		"iss": DefaultIssuer, "aud": DefaultAudience, "sub": "h", "type": "dpa",
		"version": "1", "hash": "h", "effectiveDate": "2026-01-01T00:00:00Z",
		"iat": now.Unix(), "exp": now.Add(time.Hour).Unix(),
	})
	token := header + "." + base64.RawURLEncoding.EncodeToString(body) + "."

	if _, err := signer.Verify(token, "", now); reasonOf(t, err) != ReasonInvalid {
		t.Errorf("alg none was accepted: %v", err)
	}
}

package snapshot

import (
	"strings"
	"testing"
	"time"
)

var now = time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

func payload() Payload {
	return Payload{
		TenantID:     "t1",
		Subject:      "europe_opt_in",
		PolicyID:     "europe_opt_in",
		Fingerprint:  "abc123",
		MatchedBy:    "country",
		Country:      "DE",
		Jurisdiction: "GDPR",
		Model:        "opt-in",
	}
}

func TestSignAndVerify(t *testing.T) {
	s := NewSigner("secret", "", "", 0)

	token, err := s.Sign(payload(), now)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if strings.Count(token, ".") != 2 {
		t.Errorf("token %q is not three segments", token)
	}

	got, err := s.Verify(token, "t1", now)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}

	if got.PolicyID != "europe_opt_in" {
		t.Errorf("policyId = %q", got.PolicyID)
	}
	if got.Fingerprint != "abc123" {
		t.Errorf("fingerprint = %q", got.Fingerprint)
	}
	if got.Issuer != DefaultIssuer {
		t.Errorf("issuer = %q, want %q", got.Issuer, DefaultIssuer)
	}
	if got.ExpiresAt != now.Add(DefaultTTL).Unix() {
		t.Errorf("exp = %d, want %d", got.ExpiresAt, now.Add(DefaultTTL).Unix())
	}
}

func TestVerifyFailures(t *testing.T) {
	s := NewSigner("secret", "", "", 0)

	valid, err := s.Sign(payload(), now)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	tests := []struct {
		name   string
		token  string
		tenant string
		at     time.Time
		want   FailureReason
	}{
		{name: "empty", token: "", tenant: "t1", at: now, want: ReasonMissing},
		{name: "not three segments", token: "a.b", tenant: "t1", at: now, want: ReasonMalformed},
		{name: "garbage segments", token: "!!.??.$$", tenant: "t1", at: now, want: ReasonMalformed},
		{name: "expired", token: valid, tenant: "t1", at: now.Add(DefaultTTL + time.Second), want: ReasonExpired},
		{name: "foreign tenant", token: valid, tenant: "t2", at: now, want: ReasonInvalid},
		{name: "tampered signature", token: valid[:len(valid)-4] + "AAAA", tenant: "t1", at: now, want: ReasonInvalid},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := s.Verify(tt.token, tt.tenant, tt.at)
			if err == nil {
				t.Fatal("expected a verification failure")
			}

			reason, ok := ReasonOf(err)
			if !ok {
				t.Fatalf("error %v carries no reason", err)
			}
			if reason != tt.want {
				t.Errorf("reason = %q, want %q", reason, tt.want)
			}
		})
	}
}

func TestVerifyRejectsAnotherSecret(t *testing.T) {
	token, err := NewSigner("secret-a", "", "", 0).Sign(payload(), now)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if _, err := NewSigner("secret-b", "", "", 0).Verify(token, "t1", now); err == nil {
		t.Error("a token signed with another secret was accepted")
	}
}

func TestVerifyRejectsAlgNone(t *testing.T) {
	s := NewSigner("secret", "", "", 0)

	header, err := encodeSegment(map[string]string{"alg": "none", "typ": "JWT"})
	if err != nil {
		t.Fatalf("encodeSegment: %v", err)
	}
	body, err := encodeSegment(payload())
	if err != nil {
		t.Fatalf("encodeSegment: %v", err)
	}

	if _, err := s.Verify(header+"."+body+".", "t1", now); err == nil {
		t.Error("an unsigned token was accepted")
	}
}

func TestTenantScopedAudience(t *testing.T) {
	s := NewSigner("secret", "", "", 0)

	p := payload()
	p.TenantID = ""

	token, err := s.Sign(p, now)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if _, err := s.Verify(token, "", now); err != nil {
		t.Errorf("untenanted token rejected: %v", err)
	}
	if _, err := s.Verify(token, "t1", now); err == nil {
		t.Error("an untenanted token verified against a tenant")
	}
}

func TestCustomTTL(t *testing.T) {
	s := NewSigner("secret", "", "", time.Minute)

	token, err := s.Sign(payload(), now)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if _, err := s.Verify(token, "t1", now.Add(30*time.Second)); err != nil {
		t.Errorf("token rejected inside its ttl: %v", err)
	}
	if _, err := s.Verify(token, "t1", now.Add(2*time.Minute)); err == nil {
		t.Error("token accepted past its ttl")
	}
}

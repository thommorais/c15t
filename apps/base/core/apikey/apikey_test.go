package apikey

import (
	"strings"
	"testing"
)

func TestGenerateFormat(t *testing.T) {
	key, err := Generate(EnvLive, ScopeSecret)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	if !strings.HasPrefix(key.Secret, "c15t_live_sk_") {
		t.Errorf("secret %q missing live prefix", key.Secret)
	}
	if key.Hash == "" {
		t.Error("hash is empty")
	}
	if strings.Contains(key.Hash, key.Secret) {
		t.Error("hash contains the raw secret")
	}
	if len(key.Hash) != 64 {
		t.Errorf("hash length = %d, want 64", len(key.Hash))
	}
}

func TestGenerateTestEnv(t *testing.T) {
	key, err := Generate(EnvTest, ScopeSecret)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if !strings.HasPrefix(key.Secret, "c15t_test_sk_") {
		t.Errorf("secret %q missing test prefix", key.Secret)
	}
}

func TestGenerateIsUnique(t *testing.T) {
	seen := make(map[string]struct{})
	for range 100 {
		key, err := Generate(EnvLive, ScopeSecret)
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}
		if _, dup := seen[key.Secret]; dup {
			t.Fatal("Generate produced a duplicate secret")
		}
		seen[key.Secret] = struct{}{}
	}
}

func TestHashIsDeterministic(t *testing.T) {
	const secret = "c15t_live_abc123"
	first, second := Hash(secret), Hash(secret)
	if first != second {
		t.Error("Hash is not deterministic")
	}
	if first == Hash(secret+"x") {
		t.Error("different secrets share a hash")
	}
}

func TestVerify(t *testing.T) {
	key, err := Generate(EnvLive, ScopeSecret)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	if !Verify(key.Secret, key.Hash) {
		t.Error("Verify rejected the matching secret")
	}
	if Verify("c15t_live_wrong", key.Hash) {
		t.Error("Verify accepted a wrong secret")
	}
	if Verify("", key.Hash) {
		t.Error("Verify accepted an empty secret")
	}
	if Verify(key.Secret, "") {
		t.Error("Verify accepted an empty hash")
	}
}

func TestParseBearer(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   string
	}{
		{name: "bearer", header: "Bearer c15t_live_abc", want: "c15t_live_abc"},
		{name: "lowercase scheme", header: "bearer c15t_live_abc", want: "c15t_live_abc"},
		{name: "extra whitespace", header: "Bearer    c15t_live_abc  ", want: "c15t_live_abc"},
		{name: "bare token", header: "c15t_live_abc", want: "c15t_live_abc"},
		{name: "empty", header: "", want: ""},
		{name: "scheme only", header: "Bearer", want: ""},
		{name: "scheme only with space", header: "Bearer ", want: ""},
		{name: "wrong scheme", header: "Basic c15t_live_abc", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ParseBearer(tt.header); got != tt.want {
				t.Errorf("ParseBearer(%q) = %q, want %q", tt.header, got, tt.want)
			}
		})
	}
}

func TestEnvOf(t *testing.T) {
	tests := []struct {
		secret string
		want   Env
	}{
		{secret: "c15t_live_abc", want: EnvLive},
		{secret: "c15t_test_abc", want: EnvTest},
		{secret: "garbage", want: ""},
		{secret: "", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.secret, func(t *testing.T) {
			if got := EnvOf(tt.secret); got != tt.want {
				t.Errorf("EnvOf(%q) = %q, want %q", tt.secret, got, tt.want)
			}
		})
	}
}

func TestGenerateCarriesScope(t *testing.T) {
	tests := []struct {
		name   string
		scope  Scope
		env    Env
		prefix string
	}{
		{name: "publishable live", scope: ScopePublishable, env: EnvLive, prefix: "c15t_live_pk_"},
		{name: "publishable test", scope: ScopePublishable, env: EnvTest, prefix: "c15t_test_pk_"},
		{name: "secret live", scope: ScopeSecret, env: EnvLive, prefix: "c15t_live_sk_"},
		{name: "secret test", scope: ScopeSecret, env: EnvTest, prefix: "c15t_test_sk_"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := Generate(tt.env, tt.scope)
			if err != nil {
				t.Fatalf("Generate: %v", err)
			}
			if !strings.HasPrefix(key.Secret, tt.prefix) {
				t.Errorf("secret %q missing prefix %q", key.Secret, tt.prefix)
			}
			if key.Scope != tt.scope {
				t.Errorf("scope = %q, want %q", key.Scope, tt.scope)
			}
		})
	}
}

func TestScopeOf(t *testing.T) {
	tests := []struct {
		secret string
		want   Scope
	}{
		{secret: "c15t_live_pk_abc", want: ScopePublishable},
		{secret: "c15t_test_pk_abc", want: ScopePublishable},
		{secret: "c15t_live_sk_abc", want: ScopeSecret},
		{secret: "c15t_test_sk_abc", want: ScopeSecret},
		{secret: "c15t_live_abc", want: ""},
		{secret: "garbage", want: ""},
		{secret: "", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.secret, func(t *testing.T) {
			if got := ScopeOf(tt.secret); got != tt.want {
				t.Errorf("ScopeOf(%q) = %q, want %q", tt.secret, got, tt.want)
			}
		})
	}
}

func TestScopeAllows(t *testing.T) {
	tests := []struct {
		name  string
		scope Scope
		need  Scope
		want  bool
	}{
		{name: "secret satisfies secret", scope: ScopeSecret, need: ScopeSecret, want: true},
		{name: "secret satisfies publishable", scope: ScopeSecret, need: ScopePublishable, want: true},
		{name: "publishable satisfies publishable", scope: ScopePublishable, need: ScopePublishable, want: true},
		{name: "publishable does not satisfy secret", scope: ScopePublishable, need: ScopeSecret, want: false},
		{name: "unknown satisfies nothing", scope: "", need: ScopePublishable, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.scope.Allows(tt.need); got != tt.want {
				t.Errorf("%q.Allows(%q) = %v, want %v", tt.scope, tt.need, got, tt.want)
			}
		})
	}
}

func TestEnvOfWithScopedKeys(t *testing.T) {
	if got := EnvOf("c15t_live_pk_abc"); got != EnvLive {
		t.Errorf("EnvOf = %q, want live", got)
	}
	if got := EnvOf("c15t_test_sk_abc"); got != EnvTest {
		t.Errorf("EnvOf = %q, want test", got)
	}
}

func TestParseBearerAcceptsScopedKeys(t *testing.T) {
	for _, secret := range []string{"c15t_live_pk_abc", "c15t_test_sk_abc"} {
		if got := ParseBearer(secret); got != secret {
			t.Errorf("ParseBearer(%q) = %q", secret, got)
		}
		if got := ParseBearer("Bearer " + secret); got != secret {
			t.Errorf("ParseBearer with scheme = %q", got)
		}
	}
}

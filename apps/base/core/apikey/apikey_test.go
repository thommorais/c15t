package apikey

import (
	"strings"
	"testing"
)

func TestGenerateFormat(t *testing.T) {
	key, err := Generate(EnvLive)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	if !strings.HasPrefix(key.Secret, "c15t_live_") {
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
	key, err := Generate(EnvTest)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if !strings.HasPrefix(key.Secret, "c15t_test_") {
		t.Errorf("secret %q missing test prefix", key.Secret)
	}
}

func TestGenerateIsUnique(t *testing.T) {
	seen := make(map[string]struct{})
	for range 100 {
		key, err := Generate(EnvLive)
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
	key, err := Generate(EnvLive)
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

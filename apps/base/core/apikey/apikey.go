// Package apikey issues and verifies the bearer keys that authenticate a
// tenant's writes.
package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
)

type Env string

const (
	EnvLive Env = "live"
	EnvTest Env = "test"
)

// Scope is what a key is allowed to do. Publishable keys ship in browser
// bundles and are public by definition, so they reach only the endpoints a
// consent banner needs.
type Scope string

const (
	ScopePublishable Scope = "publishable"
	ScopeSecret      Scope = "secret"
)

// Allows reports whether a key of this scope may reach an endpoint requiring
// need. Secret keys satisfy every requirement; publishable keys satisfy only
// their own.
func (s Scope) Allows(need Scope) bool {
	switch s {
	case ScopeSecret:
		return need == ScopeSecret || need == ScopePublishable
	case ScopePublishable:
		return need == ScopePublishable
	}
	return false
}

func (s Scope) marker() string {
	switch s {
	case ScopePublishable:
		return "pk"
	case ScopeSecret:
		return "sk"
	}
	return ""
}

const secretBytes = 24

type Key struct {
	Secret string
	Hash   string
	Scope  Scope
}

func Generate(env Env, scope Scope) (Key, error) {
	marker := scope.marker()
	if marker == "" {
		return Key{}, errors.New("apikey: unknown scope " + string(scope))
	}

	buf := make([]byte, secretBytes)
	if _, err := rand.Read(buf); err != nil {
		return Key{}, err
	}

	secret := "c15t_" + string(env) + "_" + marker + "_" + base64.RawURLEncoding.EncodeToString(buf)

	return Key{Secret: secret, Hash: Hash(secret), Scope: scope}, nil
}

func ScopeOf(secret string) Scope {
	for _, env := range []Env{EnvLive, EnvTest} {
		prefix := "c15t_" + string(env) + "_"
		if !strings.HasPrefix(secret, prefix) {
			continue
		}
		switch {
		case strings.HasPrefix(secret, prefix+"pk_"):
			return ScopePublishable
		case strings.HasPrefix(secret, prefix+"sk_"):
			return ScopeSecret
		}
	}
	return ""
}

func Hash(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// Verify compares in constant time so a mismatch does not leak the position of
// the first differing byte.
func Verify(secret, hash string) bool {
	if secret == "" || hash == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(Hash(secret)), []byte(hash)) == 1
}

func ParseBearer(header string) string {
	header = strings.TrimSpace(header)
	if header == "" {
		return ""
	}

	scheme, token, found := strings.Cut(header, " ")
	if !found {
		if EnvOf(header) == "" {
			return ""
		}
		return header
	}
	if !strings.EqualFold(scheme, "bearer") {
		return ""
	}

	return strings.TrimSpace(token)
}

func EnvOf(secret string) Env {
	switch {
	case strings.HasPrefix(secret, "c15t_live_"):
		return EnvLive
	case strings.HasPrefix(secret, "c15t_test_"):
		return EnvTest
	}
	return ""
}

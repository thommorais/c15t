// Package apikey issues and verifies the bearer keys that authenticate a
// tenant's writes.
package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"strings"
)

type Env string

const (
	EnvLive Env = "live"
	EnvTest Env = "test"
)

const secretBytes = 24

type Key struct {
	Secret string
	Hash   string
}

func Generate(env Env) (Key, error) {
	buf := make([]byte, secretBytes)
	if _, err := rand.Read(buf); err != nil {
		return Key{}, err
	}

	secret := "c15t_" + string(env) + "_" + base64.RawURLEncoding.EncodeToString(buf)

	return Key{Secret: secret, Hash: Hash(secret)}, nil
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

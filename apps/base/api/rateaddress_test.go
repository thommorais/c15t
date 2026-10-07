package api

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func rateAddressFor(remote string, headers map[string]string, trusted ...string) string {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = remote
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	return rateAddress(r, trusted)
}

func TestRateAddressNeverExposesTheClientAddress(t *testing.T) {
	for name, got := range map[string]string{
		"header v4": rateAddressFor("10.0.0.1:1234", map[string]string{"x-forwarded-for": "203.0.113.7"}),
		"header v6": rateAddressFor("10.0.0.1:1234", map[string]string{"x-forwarded-for": "2001:db8::7"}),
		"peer":      rateAddressFor("198.51.100.4:1234", nil),
	} {
		for _, raw := range []string{"203.0.113.7", "2001:db8::7", "198.51.100.4"} {
			if strings.Contains(got, raw) {
				t.Errorf("%s: %q contains %q", name, got, raw)
			}
		}
	}
}

func TestRateAddressIsStablePerClient(t *testing.T) {
	a := rateAddressFor("10.0.0.1:1", map[string]string{"x-forwarded-for": "203.0.113.7"})
	b := rateAddressFor("10.0.0.2:9", map[string]string{"x-forwarded-for": "203.0.113.7"})
	c := rateAddressFor("10.0.0.1:1", map[string]string{"x-forwarded-for": "203.0.113.8"})

	if a != b {
		t.Errorf("same client hashed differently: %q vs %q", a, b)
	}
	if a == c {
		t.Errorf("different clients share %q", a)
	}
}

func TestRateAddressUsesOnlyTheConfiguredHeaders(t *testing.T) {
	trusted := []string{"x-real-ip"}

	first := rateAddressFor("10.0.0.1:1", map[string]string{"x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1"}, trusted...)
	rotated := rateAddressFor("10.0.0.1:1", map[string]string{"x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.2"}, trusted...)
	if first != rotated {
		t.Error("rotating an untrusted header changed the bucket")
	}

	other := rateAddressFor("10.0.0.1:1", map[string]string{"x-real-ip": "203.0.113.8"}, trusted...)
	if first == other {
		t.Error("different clients on the trusted header share a bucket")
	}

	peerOnly := rateAddressFor("10.0.0.1:1", map[string]string{"x-forwarded-for": "198.51.100.1"}, trusted...)
	peerAgain := rateAddressFor("10.0.0.1:1", map[string]string{"x-forwarded-for": "198.51.100.9"}, trusted...)
	if peerOnly != peerAgain {
		t.Error("without the trusted header the peer address should decide the bucket")
	}
}

package request

import (
	"net/http"
	"testing"
)

func headers(pairs ...string) http.Header {
	h := http.Header{}
	for i := 0; i < len(pairs); i += 2 {
		h.Set(pairs[i], pairs[i+1])
	}
	return h
}

func TestMaskIP(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		want string
	}{
		{name: "ipv4 zeroes last octet", ip: "192.168.1.100", want: "192.168.1.0"},
		{name: "ipv4 already zero", ip: "10.0.0.0", want: "10.0.0.0"},
		{name: "ipv4 loopback", ip: "127.0.0.1", want: "127.0.0.0"},
		{name: "ipv4 public", ip: "8.8.8.8", want: "8.8.8.0"},
		{name: "ipv4 all ones", ip: "255.255.255.255", want: "255.255.255.0"},
		{name: "ipv6 keeps first 48 bits", ip: "2001:db8:85a3::1", want: "2001:db8:85a3::"},
		{name: "ipv6 full form", ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334", want: "2001:db8:85a3::"},
		{name: "ipv6 loopback", ip: "::1", want: "::"},
		{name: "ipv6 unspecified", ip: "::", want: "::"},
		{name: "ipv6 compressed with leading zero groups", ip: "::ffff:0:0:1", want: "::"},
		{name: "ipv4 mapped ipv6", ip: "::ffff:192.168.1.100", want: "::ffff:192.168.1.0"},
		{name: "ipv4 mapped ipv6 loopback", ip: "::ffff:127.0.0.1", want: "::ffff:127.0.0.0"},
		{name: "empty stays empty", ip: "", want: ""},
		{name: "garbage is dropped, never stored raw", ip: "not-an-ip", want: ""},
		{name: "ipv4 with port", ip: "192.168.1.100:8080", want: "192.168.1.0"},
		{name: "bracketed ipv6 with port", ip: "[2001:db8::1]:443", want: "2001:db8::"},
		{name: "bracketed ipv6 without port", ip: "[2001:db8::1]", want: "2001:db8::"},
		{name: "ipv6 with zone", ip: "fe80::1%eth0", want: "fe80::"},
		{name: "surrounding spaces", ip: "  203.0.113.7 ", want: "203.0.113.0"},
		{name: "unknown placeholder", ip: "unknown", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := MaskIP(tt.ip); got != tt.want {
				t.Errorf("MaskIP(%q) = %q, want %q", tt.ip, got, tt.want)
			}
		})
	}
}

func TestMaskIPIsIdempotent(t *testing.T) {
	for _, ip := range []string{"192.168.1.100", "2001:db8:85a3::1", "::ffff:10.1.2.3"} {
		once := MaskIP(ip)
		if twice := MaskIP(once); twice != once {
			t.Errorf("MaskIP not idempotent for %q: %q then %q", ip, once, twice)
		}
	}
}

func TestClientIP(t *testing.T) {
	tests := []struct {
		name    string
		headers http.Header
		opts    IPOptions
		want    string
	}{
		{
			name:    "masks by default",
			headers: headers("x-forwarded-for", "203.0.113.5"),
			want:    "203.0.113.0",
		},
		{
			name:    "x-client-ip wins over x-forwarded-for",
			headers: headers("x-client-ip", "198.51.100.7", "x-forwarded-for", "203.0.113.5"),
			want:    "198.51.100.0",
		},
		{
			name:    "takes first entry of a forwarded chain",
			headers: headers("x-forwarded-for", "203.0.113.5, 70.41.3.18, 150.172.238.178"),
			want:    "203.0.113.0",
		},
		{
			name:    "cloudflare header",
			headers: headers("cf-connecting-ip", "203.0.113.9"),
			want:    "203.0.113.0",
		},
		{
			name:    "tracking disabled returns empty",
			headers: headers("x-forwarded-for", "203.0.113.5"),
			opts:    IPOptions{DisableTracking: true},
			want:    "",
		},
		{
			name:    "masking disabled returns full address",
			headers: headers("x-forwarded-for", "203.0.113.5"),
			opts:    IPOptions{DisableMasking: true},
			want:    "203.0.113.5",
		},
		{
			name:    "custom header list",
			headers: headers("x-my-ip", "203.0.113.5", "x-forwarded-for", "198.51.100.1"),
			opts:    IPOptions{Headers: []string{"x-my-ip"}},
			want:    "203.0.113.0",
		},
		{
			name:    "no headers returns empty",
			headers: headers(),
			want:    "",
		},
		{
			name:    "ipv4 with port is masked",
			headers: headers("x-forwarded-for", "192.168.1.100:8080"),
			want:    "192.168.1.0",
		},
		{
			name:    "bracketed ipv6 with port is masked",
			headers: headers("x-forwarded-for", "[2001:db8::1]:443"),
			want:    "2001:db8::",
		},
		{
			name:    "a value that is not an address falls through to the next header",
			headers: headers("x-forwarded-for", "unknown", "x-real-ip", "198.51.100.7"),
			want:    "198.51.100.0",
		},
		{
			name:    "only junk yields nothing",
			headers: headers("x-forwarded-for", "unknown"),
			want:    "",
		},
		{
			name:    "masking disabled still strips the port",
			headers: headers("x-forwarded-for", "192.168.1.100:8080"),
			opts:    IPOptions{DisableMasking: true},
			want:    "192.168.1.100",
		},
		{
			name:    "masking disabled still drops junk",
			headers: headers("x-forwarded-for", "unknown"),
			opts:    IPOptions{DisableMasking: true},
			want:    "",
		},
		{
			name:    "blank header value skipped",
			headers: headers("x-forwarded-for", "   ", "x-real-ip", "203.0.113.5"),
			want:    "203.0.113.0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ClientIP(tt.headers, tt.opts); got != tt.want {
				t.Errorf("ClientIP = %q, want %q", got, tt.want)
			}
		})
	}
}

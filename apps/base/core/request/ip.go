// Package request extracts client evidence from incoming requests.
package request

import (
	"net/netip"
	"strings"
)

var defaultIPHeaders = []string{
	"x-client-ip",
	"x-forwarded-for",
	"cf-connecting-ip",
	"fastly-client-ip",
	"x-real-ip",
	"x-cluster-client-ip",
	"x-forwarded",
	"forwarded-for",
	"forwarded",
}

type IPOptions struct {
	// DisableTracking suppresses the address entirely.
	DisableTracking bool
	DisableMasking  bool
	// Headers overrides the default proxy header precedence.
	Headers []string
	// TrustedProxies are the peers whose forwarding headers are believed. When
	// any are set, a request from another peer is attributed to that peer and
	// its headers are ignored, since a client can write them itself. Unset, the
	// headers are always believed. Peer is the connection's remote address.
	TrustedProxies []netip.Prefix
	Peer           string
}

type headerGetter interface {
	Get(string) string
}

func ClientIP(h headerGetter, opts IPOptions) string {
	if opts.DisableTracking {
		return ""
	}

	if len(opts.TrustedProxies) > 0 {
		peer, ok := parseAddr(opts.Peer)
		if !ok {
			return ""
		}
		if !trusted(peer, opts.TrustedProxies) {
			if opts.DisableMasking {
				return peer.WithZone("").String()
			}
			return maskAddr(peer)
		}
	}

	names := opts.Headers
	if len(names) == 0 {
		names = defaultIPHeaders
	}

	for _, name := range names {
		value := h.Get(name)
		if value == "" {
			continue
		}

		// A forwarding chain lists the original client first.
		first := strings.TrimSpace(strings.Split(value, ",")[0])
		addr, ok := parseAddr(first)
		if !ok {
			continue
		}

		if opts.DisableMasking {
			return addr.WithZone("").String()
		}
		return maskAddr(addr)
	}

	return ""
}

func trusted(peer netip.Addr, proxies []netip.Prefix) bool {
	for _, prefix := range proxies {
		if prefix.Contains(peer) || prefix.Contains(peer.Unmap()) {
			return true
		}
	}
	return false
}

// MaskIP drops the identifying low bits of an address: IPv4 to /24 and IPv6 to
// /48. Input that is not an address yields "" so a value that was never masked
// is never stored.
func MaskIP(ip string) string {
	addr, ok := parseAddr(ip)
	if !ok {
		return ""
	}
	return maskAddr(addr)
}

// parseAddr accepts the shapes proxies send: a bare address, host:port and
// [v6]:port, with surrounding spaces.
func parseAddr(raw string) (netip.Addr, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return netip.Addr{}, false
	}

	if ap, err := netip.ParseAddrPort(raw); err == nil {
		return ap.Addr(), true
	}

	raw = strings.TrimSuffix(strings.TrimPrefix(raw, "["), "]")
	addr, err := netip.ParseAddr(raw)
	return addr, err == nil
}

func maskAddr(addr netip.Addr) string {
	addr = addr.WithZone("")

	// An IPv4-mapped address is masked as IPv4 so the embedded octets are
	// truncated rather than the surrounding IPv6 prefix.
	if addr.Is4In6() {
		masked, ok := maskPrefix(addr.Unmap(), 24)
		if !ok {
			return ""
		}
		return "::ffff:" + masked.String()
	}

	bits := 48
	if addr.Is4() {
		bits = 24
	}

	masked, ok := maskPrefix(addr, bits)
	if !ok {
		return ""
	}
	return masked.String()
}

func maskPrefix(addr netip.Addr, bits int) (netip.Addr, bool) {
	prefix, err := addr.Prefix(bits)
	if err != nil {
		return netip.Addr{}, false
	}
	return prefix.Addr(), true
}

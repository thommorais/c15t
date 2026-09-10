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
}

type headerGetter interface {
	Get(string) string
}

func ClientIP(h headerGetter, opts IPOptions) string {
	if opts.DisableTracking {
		return ""
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
		ip := strings.TrimSpace(strings.Split(value, ",")[0])
		if ip == "" {
			continue
		}

		if opts.DisableMasking {
			return ip
		}
		return MaskIP(ip)
	}

	return ""
}

// MaskIP drops the identifying low bits of an address: IPv4 to /24 and IPv6 to
// /48. Unparseable input is returned unchanged.
func MaskIP(ip string) string {
	if ip == "" {
		return ""
	}

	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}

	// An IPv4-mapped address is masked as IPv4 so the embedded octets are
	// truncated rather than the surrounding IPv6 prefix.
	if addr.Is4In6() {
		masked, ok := maskPrefix(addr.Unmap(), 24)
		if !ok {
			return ip
		}
		return "::ffff:" + masked.String()
	}

	bits := 48
	if addr.Is4() {
		bits = 24
	}

	masked, ok := maskPrefix(addr, bits)
	if !ok {
		return ip
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

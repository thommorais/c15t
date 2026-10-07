// Package origin matches a request's Origin header against an allowlist.
//
// A publishable key is public by definition, so binding it to the sites that
// may use it is what stops a copied key being used from anywhere.
package origin

import (
	"net/url"
	"strings"
)

type wildcardEntry struct {
	scheme string
	host   string
}

type List struct {
	exact    map[string]struct{}
	bare     map[string]struct{}
	wildcard []wildcardEntry
	open     bool
}

// Parse reads a comma separated allowlist. An empty list, or "*", allows every
// origin.
func Parse(raw string) List {
	list := List{exact: map[string]struct{}{}, bare: map[string]struct{}{}}

	entries := strings.Split(raw, ",")
	found := false

	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if entry == "*" {
			return List{open: true}
		}

		found = true

		if scheme, host, ok := splitWildcard(entry); ok {
			host = normalize(host)
			// An entry that would cover a whole public suffix, or is not a
			// well formed wildcard, matches nothing instead of widening access.
			if validWildcardBase(host) {
				list.wildcard = append(list.wildcard, wildcardEntry{scheme: scheme, host: host})
			}
			continue
		}

		key := normalize(entry)
		if scheme, hostport := split(key); scheme == "" {
			list.bare[hostport] = struct{}{}
			continue
		}
		list.exact[key] = struct{}{}
	}

	if !found {
		list.open = true
	}

	return list
}

func (l List) Unrestricted() bool {
	return l.open
}

func (l List) Allows(origin string) bool {
	if l.open {
		return true
	}
	if origin == "" {
		return false
	}

	candidate := normalize(origin)
	if _, ok := l.exact[candidate]; ok {
		return true
	}

	scheme, host := split(candidate)

	// An entry that names no scheme covers the web schemes, so a bare host keeps
	// working whichever of http and https a site is served over. App schemes
	// have to be listed.
	if isWebScheme(scheme) {
		if _, ok := l.bare[host]; ok {
			return true
		}
	}

	for _, w := range l.wildcard {
		if w.scheme != "" && w.scheme != scheme {
			continue
		}
		// A wildcard covers subdomains only, so the bare domain and lookalikes
		// such as evilnina.app stay out.
		if strings.HasSuffix(host, "."+w.host) && host != w.host {
			return true
		}
	}

	return false
}

// normalize reduces an origin to scheme://host[:port], lowercased, with a
// default port and a leading www dropped so equivalent spellings compare equal.
func normalize(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	raw = strings.TrimSuffix(raw, "/")

	scheme, rest := split(raw)
	host, port := splitPort(rest)
	// www equivalence is a web convention; a custom scheme names its host as is.
	if scheme == "" || isWebScheme(scheme) {
		host = strings.TrimPrefix(host, "www.")
	}

	if isDefaultPort(scheme, port) {
		port = ""
	}

	out := host
	if port != "" {
		out += ":" + port
	}
	if scheme != "" {
		out = scheme + "://" + out
	}

	return out
}

// splitWildcard separates a "*." entry into its scheme prefix and the host the
// wildcard covers.
func splitWildcard(entry string) (string, string, bool) {
	scheme, rest := split(strings.ToLower(strings.TrimSpace(entry)))

	host, ok := strings.CutPrefix(rest, "*.")
	if !ok {
		return "", "", false
	}

	return scheme, host, true
}

// split separates a scheme from the rest of an origin.
func split(raw string) (string, string) {
	if scheme, rest, found := strings.Cut(raw, "://"); found {
		return scheme, rest
	}
	return "", raw
}

func splitPort(hostport string) (string, string) {
	i := strings.LastIndex(hostport, ":")
	if i < 0 {
		return hostport, ""
	}

	host, port := hostport[:i], hostport[i+1:]
	if _, err := url.Parse("//" + hostport); err != nil {
		return hostport, ""
	}

	return host, port
}

func isWebScheme(scheme string) bool {
	switch scheme {
	case "http", "https", "ws", "wss":
		return true
	}
	return false
}

// validWildcardBase accepts the host a "*." entry covers. It needs at least two
// labels so "*.com" cannot cover every .com site; "localhost" is the one
// single-label name that is not a public suffix.
func validWildcardBase(host string) bool {
	name, _ := splitPort(host)

	if name == "" || strings.Contains(name, "*") || strings.HasPrefix(name, ".") ||
		strings.HasSuffix(name, ".") || strings.Contains(name, "..") {
		return false
	}

	return strings.Contains(name, ".") || name == "localhost"
}

func isDefaultPort(scheme, port string) bool {
	switch scheme {
	case "http", "ws":
		return port == "80"
	case "https", "wss":
		return port == "443"
	}
	return false
}

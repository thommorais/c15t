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
	wildcard []wildcardEntry
	open     bool
}

// Parse reads a comma separated allowlist. An empty list, or "*", allows every
// origin.
func Parse(raw string) List {
	list := List{exact: map[string]struct{}{}}

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
			list.wildcard = append(list.wildcard, wildcardEntry{
				scheme: scheme,
				host:   normalize(host),
			})
			continue
		}
		list.exact[normalize(entry)] = struct{}{}
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
	host = strings.TrimPrefix(host, "www.")

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

func isDefaultPort(scheme, port string) bool {
	switch scheme {
	case "http", "ws":
		return port == "80"
	case "https", "wss":
		return port == "443"
	}
	return false
}

package origin

import "testing"

func TestAllowedWhenUnrestricted(t *testing.T) {
	list := Parse("")

	if !list.Unrestricted() {
		t.Error("an empty list should be unrestricted")
	}
	for _, o := range []string{"https://anything.com", ""} {
		if !list.Allows(o) {
			t.Errorf("unrestricted list rejected %q", o)
		}
	}
}

func TestExactMatch(t *testing.T) {
	list := Parse("https://nina.app, https://admin.nina.app")

	tests := []struct {
		origin string
		want   bool
	}{
		{origin: "https://nina.app", want: true},
		{origin: "https://admin.nina.app", want: true},
		{origin: "https://evil.com", want: false},
		{origin: "https://other.nina.app", want: false},
		{origin: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.origin, func(t *testing.T) {
			if got := list.Allows(tt.origin); got != tt.want {
				t.Errorf("Allows(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

func TestSchemeAndPortAreSignificant(t *testing.T) {
	list := Parse("https://nina.app")

	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{name: "same scheme", origin: "https://nina.app", want: true},
		{name: "http is not https", origin: "http://nina.app", want: false},
		{name: "explicit default port", origin: "https://nina.app:443", want: true},
		{name: "other port", origin: "https://nina.app:8443", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := list.Allows(tt.origin); got != tt.want {
				t.Errorf("Allows(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

func TestWildcard(t *testing.T) {
	list := Parse("https://*.nina.app")

	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{name: "subdomain matches", origin: "https://app.nina.app", want: true},
		{name: "deep subdomain matches", origin: "https://a.b.nina.app", want: true},
		{name: "bare domain does not match", origin: "https://nina.app", want: false},
		{name: "suffix lookalike is rejected", origin: "https://evilnina.app", want: false},
		{name: "different domain", origin: "https://app.other.app", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := list.Allows(tt.origin); got != tt.want {
				t.Errorf("Allows(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

func TestWwwIsIgnored(t *testing.T) {
	list := Parse("https://nina.app")

	if !list.Allows("https://www.nina.app") {
		t.Error("www subdomain should match the bare configured domain")
	}
}

func TestCaseAndWhitespaceAreNormalised(t *testing.T) {
	list := Parse("  HTTPS://Nina.App  ,  ")

	if !list.Allows("https://nina.app") {
		t.Error("configured entry was not normalised")
	}
	if !list.Allows("HTTPS://NINA.APP") {
		t.Error("request origin was not normalised")
	}
}

func TestTrailingSlashIsIgnored(t *testing.T) {
	list := Parse("https://nina.app/")

	if !list.Allows("https://nina.app") {
		t.Error("trailing slash in configuration should not matter")
	}
}

func TestStarAllowsEverything(t *testing.T) {
	list := Parse("*")

	if !list.Unrestricted() {
		t.Error("* should be unrestricted")
	}
	if !list.Allows("https://anything.com") {
		t.Error("* rejected an origin")
	}
}

func TestBareHostEntryMatchesAnyWebScheme(t *testing.T) {
	tests := []struct {
		name   string
		list   string
		origin string
		want   bool
	}{
		{name: "https", list: "example.com", origin: "https://example.com", want: true},
		{name: "http", list: "example.com", origin: "http://example.com", want: true},
		{name: "wss", list: "example.com", origin: "wss://example.com", want: true},
		{name: "explicit default port", list: "example.com", origin: "https://example.com:443", want: true},
		{name: "www on the origin", list: "example.com", origin: "https://www.example.com", want: true},
		{name: "www on the entry", list: "www.example.com", origin: "https://example.com", want: true},
		{name: "other host", list: "example.com", origin: "https://evil.com", want: false},
		{name: "lookalike", list: "example.com", origin: "https://evilexample.com", want: false},
		{name: "other port", list: "example.com", origin: "https://example.com:3000", want: false},
		{name: "app scheme is not a web scheme", list: "example.com", origin: "capacitor://example.com", want: false},
		{name: "entry port is honoured", list: "localhost:3000", origin: "http://localhost:3000", want: true},
		{name: "entry port rejects the default", list: "localhost:3000", origin: "http://localhost", want: false},
		{name: "case and spaces", list: "  Example.COM ", origin: "HTTPS://EXAMPLE.com", want: true},
		{name: "explicit scheme stays significant", list: "https://example.com", origin: "http://example.com", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Parse(tt.list).Allows(tt.origin); got != tt.want {
				t.Errorf("Parse(%q).Allows(%q) = %v, want %v", tt.list, tt.origin, got, tt.want)
			}
		})
	}
}

func TestAppSchemeHostsMatchVerbatim(t *testing.T) {
	tests := []struct {
		name   string
		list   string
		origin string
		want   bool
	}{
		{name: "listed verbatim", list: "capacitor://localhost", origin: "capacitor://localhost", want: true},
		{name: "ionic", list: "ionic://localhost", origin: "ionic://localhost", want: true},
		{name: "custom scheme", list: "myapp://localhost", origin: "myapp://localhost", want: true},
		{name: "other host on the scheme", list: "capacitor://localhost", origin: "capacitor://evil.com", want: false},
		{name: "other app scheme", list: "capacitor://localhost", origin: "ionic://localhost", want: false},
		{name: "web scheme on the same host", list: "capacitor://localhost", origin: "https://localhost", want: false},
		{name: "no www equivalence on the origin", list: "capacitor://localhost", origin: "capacitor://www.localhost", want: false},
		{name: "no www equivalence on the entry", list: "capacitor://www.localhost", origin: "capacitor://localhost", want: false},
		{name: "android webview", list: "http://localhost", origin: "http://localhost", want: true},
		{name: "app and web origins side by side", list: "https://app.example.com, capacitor://localhost, http://localhost", origin: "capacitor://localhost", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Parse(tt.list).Allows(tt.origin); got != tt.want {
				t.Errorf("Parse(%q).Allows(%q) = %v, want %v", tt.list, tt.origin, got, tt.want)
			}
		})
	}
}

func TestWildcardEntriesThatWouldWidenAccessMatchNothing(t *testing.T) {
	tests := []struct {
		list   string
		origin string
	}{
		{list: "*.com", origin: "https://evil.com"},
		{list: "https://*.com", origin: "https://evil.com"},
		{list: "*.", origin: "https://evil.com"},
		{list: "*.*.example.com", origin: "https://a.b.example.com"},
		{list: "*example.com", origin: "https://evilexample.com"},
		{list: "www.*", origin: "https://evil.com"},
		{list: "www.*.example.com", origin: "https://evil.example.com"},
		{list: "www.*.example.com", origin: "https://evil.com"},
		{list: "*..example.com", origin: "https://a.example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.list, func(t *testing.T) {
			list := Parse(tt.list)
			if list.Unrestricted() {
				t.Fatalf("Parse(%q) is unrestricted, a bad entry must fail closed", tt.list)
			}
			if list.Allows(tt.origin) {
				t.Errorf("Parse(%q).Allows(%q) = true, want false", tt.list, tt.origin)
			}
		})
	}
}

func TestWildcardOnLocalhostIsAllowed(t *testing.T) {
	list := Parse("http://*.localhost")
	if !list.Allows("http://app.localhost") {
		t.Error("*.localhost should match a subdomain of localhost")
	}
	if list.Allows("http://localhost") {
		t.Error("*.localhost must not match the bare host")
	}
}

func TestSchemelessWildcardCoversAnyScheme(t *testing.T) {
	list := Parse("*.example.com")
	for _, o := range []string{"https://app.example.com", "http://app.example.com", "capacitor://app.example.com"} {
		if !list.Allows(o) {
			t.Errorf("Allows(%q) = false, want true", o)
		}
	}
	if list.Allows("https://example.com") || list.Allows("https://www.example.com") {
		t.Error("the bare domain, with or without www, must not match a subdomain wildcard")
	}
}

func TestWwwEquivalenceBothWays(t *testing.T) {
	if !Parse("https://www.nina.app").Allows("https://nina.app") {
		t.Error("a www entry should match the bare origin")
	}
	if !Parse("https://nina.app").Allows("https://www.nina.app") {
		t.Error("a bare entry should match the www origin")
	}
}

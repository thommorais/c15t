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

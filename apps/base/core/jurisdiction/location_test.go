package jurisdiction

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

func TestLocationFromHeaders(t *testing.T) {
	tests := []struct {
		name        string
		headers     http.Header
		wantCountry string
		wantRegion  string
	}{
		{
			name:        "c15t header wins over cloudflare",
			headers:     headers("x-c15t-country", "FR", "cf-ipcountry", "DE"),
			wantCountry: "FR",
		},
		{
			name:        "cloudflare",
			headers:     headers("cf-ipcountry", "DE"),
			wantCountry: "DE",
		},
		{
			name:        "vercel",
			headers:     headers("x-vercel-ip-country", "GB"),
			wantCountry: "GB",
		},
		{
			name:        "cloudfront",
			headers:     headers("x-amz-cf-ipcountry", "JP"),
			wantCountry: "JP",
		},
		{
			name:        "generic country header",
			headers:     headers("x-country", "BR"),
			wantCountry: "BR",
		},
		{
			name:        "generic country code header",
			headers:     headers("x-country-code", "AU"),
			wantCountry: "AU",
		},
		{
			name:       "c15t region wins",
			headers:    headers("x-c15t-region", "CA", "x-vercel-ip-country-region", "NY"),
			wantRegion: "CA",
		},
		{
			name:        "vercel region",
			headers:     headers("x-vercel-ip-country", "US", "x-vercel-ip-country-region", "CA"),
			wantCountry: "US",
			wantRegion:  "CA",
		},
		{
			name:       "generic region header",
			headers:    headers("x-region-code", "QC"),
			wantRegion: "QC",
		},
		{
			name:    "no geo headers",
			headers: headers(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := LocationFromHeaders(tt.headers)
			if got.CountryCode != tt.wantCountry {
				t.Errorf("country = %q, want %q", got.CountryCode, tt.wantCountry)
			}
			if got.RegionCode != tt.wantRegion {
				t.Errorf("region = %q, want %q", got.RegionCode, tt.wantRegion)
			}
		})
	}
}

func TestLocationKnown(t *testing.T) {
	if (Location{}).Known() {
		t.Error("empty location reported as known")
	}
	if !(Location{CountryCode: "DE"}).Known() {
		t.Error("location with a country reported as unknown")
	}
}

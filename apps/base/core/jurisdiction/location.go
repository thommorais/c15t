package jurisdiction

import "net/http"

// Country and region come from CDN-supplied headers rather than IP lookup, in
// descending order of trust.
var (
	countryHeaders = []string{
		"x-c15t-country",
		"cf-ipcountry",
		"x-vercel-ip-country",
		"x-amz-cf-ipcountry",
		"x-country",
		"x-country-code",
	}
	regionHeaders = []string{
		"x-c15t-region",
		"x-vercel-ip-country-region",
		"x-region-code",
	}
)

type Location struct {
	CountryCode string
	RegionCode  string
}

// Known reports whether the country is set. Policy resolution treats an unknown
// location differently from one that simply matches no policy.
func (l Location) Known() bool {
	return l.CountryCode != ""
}

func LocationFromHeaders(h http.Header) Location {
	return Location{
		CountryCode: firstHeader(h, countryHeaders),
		RegionCode:  firstHeader(h, regionHeaders),
	}
}

func firstHeader(h http.Header, names []string) string {
	for _, name := range names {
		if v := h.Get(name); v != "" {
			return v
		}
	}
	return ""
}

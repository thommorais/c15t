// Package jurisdiction maps a request's location to the privacy regulation
// that applies to it.
package jurisdiction

import (
	"slices"
	"strings"
)

type Code string

const (
	UKGDPR  Code = "UK_GDPR"
	GDPR    Code = "GDPR"
	CH      Code = "CH"
	BR      Code = "BR"
	PIPEDA  Code = "PIPEDA"
	QCLaw25 Code = "QC_LAW25"
	AU      Code = "AU"
	APPI    Code = "APPI"
	PIPA    Code = "PIPA"
	CCPA    Code = "CCPA"
	None    Code = "NONE"
)

var Codes = []Code{UKGDPR, GDPR, CH, BR, PIPEDA, QCLaw25, AU, APPI, PIPA, CCPA, None}

func (c Code) Valid() bool {
	return slices.Contains(Codes, c)
}

var (
	euCountries = []string{
		"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
		"HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
		"SI", "ES", "SE",
	}
	eeaCountries = []string{"IS", "NO", "LI"}
	ccpaRegions  = []string{"CA"}
	law25Regions = []string{"QC"}
)

// Check resolves the regulation for a country and optional subdivision. The
// region may arrive prefixed with its country ("US-CA"), in which case only the
// trailing subdivision is significant.
func Check(countryCode, regionCode string) Code {
	country := normalize(countryCode)
	if country == "" {
		return None
	}
	region := normalizeRegion(regionCode)

	// Sub-national regimes are checked first so they win over the country rule.
	if country == "US" && slices.Contains(ccpaRegions, region) {
		return CCPA
	}
	if country == "CA" && slices.Contains(law25Regions, region) {
		return QCLaw25
	}

	switch {
	case country == "GB":
		return UKGDPR
	case slices.Contains(euCountries, country), slices.Contains(eeaCountries, country):
		return GDPR
	case country == "CH":
		return CH
	case country == "BR":
		return BR
	case country == "CA":
		return PIPEDA
	case country == "AU":
		return AU
	case country == "JP":
		return APPI
	case country == "KR":
		return PIPA
	}

	return None
}

// Resolve returns GDPR when geo-location is disabled, treating the strictest
// common regime as the safe default rather than assuming no regulation applies.
func Resolve(loc Location, geoDisabled bool) Code {
	if geoDisabled {
		return GDPR
	}
	return Check(loc.CountryCode, loc.RegionCode)
}

func normalize(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func normalizeRegion(code string) string {
	code = strings.TrimSpace(code)
	if i := strings.LastIndex(code, "-"); i >= 0 {
		code = code[i+1:]
	}
	return normalize(code)
}

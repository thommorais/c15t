package jurisdiction

import "testing"

func TestCheck(t *testing.T) {
	tests := []struct {
		name    string
		country string
		region  string
		want    Code
	}{
		{name: "california is ccpa", country: "US", region: "CA", want: CCPA},
		{name: "california prefixed region", country: "US", region: "US-CA", want: CCPA},
		{name: "california lowercase", country: "us", region: "ca", want: CCPA},
		{name: "other us state is none", country: "US", region: "NY", want: None},
		{name: "us without region is none", country: "US", want: None},

		{name: "quebec is law25", country: "CA", region: "QC", want: QCLaw25},
		{name: "quebec prefixed region", country: "CA", region: "CA-QC", want: QCLaw25},
		{name: "canada outside quebec is pipeda", country: "CA", region: "ON", want: PIPEDA},
		{name: "canada without region is pipeda", country: "CA", want: PIPEDA},

		{name: "uk is uk gdpr", country: "GB", want: UKGDPR},
		{name: "germany is gdpr", country: "DE", want: GDPR},
		{name: "france is gdpr", country: "FR", want: GDPR},
		{name: "norway is gdpr via eea", country: "NO", want: GDPR},
		{name: "iceland is gdpr via eea", country: "IS", want: GDPR},
		{name: "liechtenstein is gdpr via eea", country: "LI", want: GDPR},

		{name: "switzerland", country: "CH", want: CH},
		{name: "brazil", country: "BR", want: BR},
		{name: "australia", country: "AU", want: AU},
		{name: "japan is appi", country: "JP", want: APPI},
		{name: "korea is pipa", country: "KR", want: PIPA},

		{name: "unknown country is none", country: "ZZ", want: None},
		{name: "empty country is none", country: "", want: None},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Check(tt.country, tt.region); got != tt.want {
				t.Errorf("Check(%q, %q) = %q, want %q", tt.country, tt.region, got, tt.want)
			}
		})
	}
}

func TestCheckSwitzerlandNotTreatedAsEEA(t *testing.T) {
	if got := Check("CH", ""); got == GDPR {
		t.Error("switzerland must not resolve to GDPR")
	}
}

func TestResolveWhenGeoDisabled(t *testing.T) {
	got := Resolve(Location{CountryCode: "DE", RegionCode: ""}, true)
	if got != GDPR {
		t.Errorf("Resolve with geo disabled = %q, want GDPR as the safe default", got)
	}
}

func TestResolveUsesLocation(t *testing.T) {
	got := Resolve(Location{CountryCode: "US", RegionCode: "CA"}, false)
	if got != CCPA {
		t.Errorf("Resolve = %q, want CCPA", got)
	}
}

func TestCodeIsValid(t *testing.T) {
	for _, c := range Codes {
		if !c.Valid() {
			t.Errorf("%q reported invalid", c)
		}
	}
	if Code("NOPE").Valid() {
		t.Error("unknown code reported valid")
	}
}

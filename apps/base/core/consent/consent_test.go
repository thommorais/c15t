package consent

import (
	"testing"
	"time"

	"thom/core/jurisdiction"
	"thom/core/policy"
)

func ptr[T any](v T) *T { return &v }

var fixedNow = time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

func optInPolicy(expiryDays *int, scope policy.ScopeMode, categories []string) policy.Resolved {
	return policy.Resolved{
		ID:    "p",
		Model: policy.ModelOptIn,
		Consent: &policy.ResolvedConsent{
			ExpiryDays: expiryDays,
			ScopeMode:  scope,
			Categories: categories,
		},
	}
}

func TestBuildValidUntil(t *testing.T) {
	tests := []struct {
		name       string
		expiryDays *int
		want       *time.Time
	}{
		{
			name:       "expiry derives from policy",
			expiryDays: ptr(365),
			want:       ptr(fixedNow.AddDate(0, 0, 365)),
		},
		{
			name:       "no expiry stays nil",
			expiryDays: nil,
			want:       nil,
		},
		{
			name:       "zero expiry stays nil",
			expiryDays: ptr(0),
			want:       nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Build(Input{
				SubjectID:  "s1",
				DomainID:   "d1",
				Categories: []string{"necessary"},
				Policy:     optInPolicy(tt.expiryDays, policy.ScopePermissive, nil),
				Now:        fixedNow,
			})
			if err != nil {
				t.Fatalf("Build: %v", err)
			}

			switch {
			case tt.want == nil && got.ValidUntil != nil:
				t.Errorf("validUntil = %v, want nil", *got.ValidUntil)
			case tt.want != nil && got.ValidUntil == nil:
				t.Errorf("validUntil = nil, want %v", *tt.want)
			case tt.want != nil && !got.ValidUntil.Equal(*tt.want):
				t.Errorf("validUntil = %v, want %v", *got.ValidUntil, *tt.want)
			}
		})
	}
}

func TestBuildStrictScopeRejectsOutOfScope(t *testing.T) {
	_, err := Build(Input{
		SubjectID:  "s1",
		DomainID:   "d1",
		Categories: []string{"necessary", "marketing"},
		Policy:     optInPolicy(nil, policy.ScopeStrict, []string{"necessary"}),
		Now:        fixedNow,
	})

	if err == nil {
		t.Fatal("expected strict scope to reject an out-of-scope category")
	}
	if !IsOutOfScope(err) {
		t.Errorf("error %v is not reported as out of scope", err)
	}
}

func TestBuildScopeAllowances(t *testing.T) {
	tests := []struct {
		name       string
		scope      policy.ScopeMode
		allowed    []string
		requested  []string
		wantAccept bool
	}{
		{
			name:       "permissive allows out of scope",
			scope:      policy.ScopePermissive,
			allowed:    []string{"necessary"},
			requested:  []string{"necessary", "marketing"},
			wantAccept: true,
		},
		{
			name:       "strict allows in scope",
			scope:      policy.ScopeStrict,
			allowed:    []string{"necessary", "marketing"},
			requested:  []string{"marketing"},
			wantAccept: true,
		},
		{
			name:       "strict wildcard allows anything",
			scope:      policy.ScopeStrict,
			allowed:    []string{policy.CategoryWildcard},
			requested:  []string{"marketing"},
			wantAccept: true,
		},
		{
			name:       "strict with no allowlist allows anything",
			scope:      policy.ScopeStrict,
			allowed:    nil,
			requested:  []string{"marketing"},
			wantAccept: true,
		},
		{
			name:       "strict rejects out of scope",
			scope:      policy.ScopeStrict,
			allowed:    []string{"necessary"},
			requested:  []string{"marketing"},
			wantAccept: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Build(Input{
				SubjectID:  "s1",
				DomainID:   "d1",
				Categories: tt.requested,
				Policy:     optInPolicy(nil, tt.scope, tt.allowed),
				Now:        fixedNow,
			})

			if tt.wantAccept && err != nil {
				t.Errorf("unexpected rejection: %v", err)
			}
			if !tt.wantAccept && err == nil {
				t.Error("expected rejection")
			}
		})
	}
}

func TestBuildRequiresIdentifiers(t *testing.T) {
	tests := []struct {
		name  string
		input Input
	}{
		{
			name:  "missing subject",
			input: Input{DomainID: "d1", Categories: []string{"necessary"}},
		},
		{
			name:  "missing domain",
			input: Input{SubjectID: "s1", Categories: []string{"necessary"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.input.Policy = optInPolicy(nil, policy.ScopePermissive, nil)
			tt.input.Now = fixedNow

			if _, err := Build(tt.input); err == nil {
				t.Error("expected an error")
			}
		})
	}
}

func TestBuildRecordsEvidence(t *testing.T) {
	got, err := Build(Input{
		SubjectID:    "s1",
		DomainID:     "d1",
		Categories:   []string{"necessary", "necessary", " measurement "},
		Policy:       optInPolicy(ptr(365), policy.ScopePermissive, nil),
		Jurisdiction: jurisdiction.GDPR,
		IPAddress:    "203.0.113.0",
		UserAgent:    "curl/8",
		UISource:     SourceBanner,
		Action:       ActionAcceptAll,
		Now:          fixedNow,
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}

	if got.Jurisdiction != string(jurisdiction.GDPR) {
		t.Errorf("jurisdiction = %q, want GDPR", got.Jurisdiction)
	}
	if got.JurisdictionModel != string(policy.ModelOptIn) {
		t.Errorf("jurisdictionModel = %q, want opt-in", got.JurisdictionModel)
	}
	if got.IPAddress != "203.0.113.0" {
		t.Errorf("ipAddress = %q", got.IPAddress)
	}
	if got.GivenAt != fixedNow {
		t.Errorf("givenAt = %v, want %v", got.GivenAt, fixedNow)
	}
	if !equalStrings(got.Categories, []string{"necessary", "measurement"}) {
		t.Errorf("categories = %v, want deduplicated and trimmed", got.Categories)
	}
}

func TestBuildRejectsUnknownAction(t *testing.T) {
	_, err := Build(Input{
		SubjectID:  "s1",
		DomainID:   "d1",
		Categories: []string{"necessary"},
		Policy:     optInPolicy(nil, policy.ScopePermissive, nil),
		Action:     Action("shrug"),
		Now:        fixedNow,
	})

	if err == nil {
		t.Error("expected an unknown action to be rejected")
	}
}

func TestBuildRejectsUnknownUISource(t *testing.T) {
	_, err := Build(Input{
		SubjectID:  "s1",
		DomainID:   "d1",
		Categories: []string{"necessary"},
		Policy:     optInPolicy(nil, policy.ScopePermissive, nil),
		UISource:   UISource("telepathy"),
		Now:        fixedNow,
	})

	if err == nil {
		t.Error("expected an unknown ui source to be rejected")
	}
}

func TestBuildAppliesGPC(t *testing.T) {
	gpcPolicy := policy.Resolved{
		ID:    "ccpa",
		Model: policy.ModelOptOut,
		Consent: &policy.ResolvedConsent{
			ScopeMode: policy.ScopePermissive,
			GPC:       ptr(true),
		},
	}

	got, err := Build(Input{
		SubjectID:  "s1",
		DomainID:   "d1",
		Categories: []string{"necessary", "marketing", "measurement"},
		Policy:     gpcPolicy,
		GPCSignal:  true,
		Action:     ActionAcceptAll,
		Now:        fixedNow,
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}

	if !equalStrings(got.Categories, []string{"necessary"}) {
		t.Errorf("categories = %v, want marketing and measurement dropped by GPC", got.Categories)
	}
	if got.Action != ActionOptOut {
		t.Errorf("action = %q, want opt_out after a GPC signal", got.Action)
	}
}

func TestBuildIgnoresGPCWhenPolicyDisablesIt(t *testing.T) {
	got, err := Build(Input{
		SubjectID:  "s1",
		DomainID:   "d1",
		Categories: []string{"necessary", "marketing"},
		Policy:     optInPolicy(nil, policy.ScopePermissive, nil),
		GPCSignal:  true,
		Now:        fixedNow,
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}

	if !equalStrings(got.Categories, []string{"necessary", "marketing"}) {
		t.Errorf("categories = %v, want GPC ignored for a policy without gpc=true", got.Categories)
	}
}

func TestBuildGPCOnlyAffectsAutoGranted(t *testing.T) {
	gpcPolicy := policy.Resolved{
		ID:    "ccpa",
		Model: policy.ModelOptOut,
		Consent: &policy.ResolvedConsent{
			ScopeMode: policy.ScopePermissive,
			GPC:       ptr(true),
		},
	}

	got, err := Build(Input{
		SubjectID:  "s1",
		DomainID:   "d1",
		Categories: []string{"necessary", "marketing"},
		Policy:     gpcPolicy,
		GPCSignal:  true,
		Action:     ActionCustom,
		Now:        fixedNow,
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}

	if !equalStrings(got.Categories, []string{"necessary", "marketing"}) {
		t.Errorf("categories = %v, want an explicit choice preserved", got.Categories)
	}
}

func TestDedupeKeyIsStableAndScoped(t *testing.T) {
	decision := policy.Decision{
		Policy:      optInPolicy(ptr(365), policy.ScopePermissive, nil),
		MatchedBy:   policy.MatchedByCountry,
		Fingerprint: "abc123",
	}

	base := DecisionKey{
		TenantID:     "t1",
		Fingerprint:  decision.Fingerprint,
		MatchedBy:    string(decision.MatchedBy),
		CountryCode:  "DE",
		RegionCode:   "",
		Jurisdiction: string(jurisdiction.GDPR),
	}

	first, second := DedupeKey(base), DedupeKey(base)
	if first != second {
		t.Errorf("dedupe key not stable: %q vs %q", first, second)
	}

	variants := map[string]DecisionKey{
		"tenant":       {TenantID: "t2", Fingerprint: "abc123", MatchedBy: "country", CountryCode: "DE", Jurisdiction: "GDPR"},
		"fingerprint":  {TenantID: "t1", Fingerprint: "def456", MatchedBy: "country", CountryCode: "DE", Jurisdiction: "GDPR"},
		"matchedBy":    {TenantID: "t1", Fingerprint: "abc123", MatchedBy: "default", CountryCode: "DE", Jurisdiction: "GDPR"},
		"country":      {TenantID: "t1", Fingerprint: "abc123", MatchedBy: "country", CountryCode: "FR", Jurisdiction: "GDPR"},
		"jurisdiction": {TenantID: "t1", Fingerprint: "abc123", MatchedBy: "country", CountryCode: "DE", Jurisdiction: "NONE"},
	}

	for name, v := range variants {
		t.Run(name, func(t *testing.T) {
			if DedupeKey(v) == first {
				t.Errorf("%s did not change the dedupe key", name)
			}
		})
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestValidationErrorsAreIdentifiable(t *testing.T) {
	tests := []struct {
		name  string
		input Input
	}{
		{name: "missing subject", input: Input{DomainID: "d1"}},
		{name: "missing domain", input: Input{SubjectID: "s1"}},
		{name: "bad ui source", input: Input{SubjectID: "s1", DomainID: "d1", UISource: UISource("telepathy")}},
		{name: "bad action", input: Input{SubjectID: "s1", DomainID: "d1", Action: Action("shrug")}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.input.Policy = optInPolicy(nil, policy.ScopePermissive, nil)
			tt.input.Now = fixedNow

			_, err := Build(tt.input)
			if err == nil {
				t.Fatal("expected an error")
			}
			if !IsInvalid(err) {
				t.Errorf("error %v is not reported as invalid input", err)
			}
		})
	}
}

func TestOutOfScopeIsAlsoInvalid(t *testing.T) {
	_, err := Build(Input{
		SubjectID:  "s1",
		DomainID:   "d1",
		Categories: []string{"marketing"},
		Policy:     optInPolicy(nil, policy.ScopeStrict, []string{"necessary"}),
		Now:        fixedNow,
	})
	if !IsInvalid(err) {
		t.Errorf("out-of-scope error %v should count as invalid input", err)
	}
}

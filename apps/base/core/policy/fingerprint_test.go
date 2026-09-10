package policy

import "testing"

func ptr[T any](v T) *T { return &v }

func TestSHA256Hex(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "empty string",
			input: "",
			want:  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		},
		{
			name:  "short ascii",
			input: "c15t",
			want:  "022db6788d676d5212e4249243ac3ee4f6b5e2dd77a298b4d4443d4c5826c6ac",
		},
		{
			name:  "long policy-like json",
			input: `{"consent":{"categories":["necessary","measurement"],"expiryDays":365,"scopeMode":"strict"},"id":"policy_runtime_us_ca","model":"opt-in","ui":{"banner":{"allowedActions":["accept","reject"],"direction":"row","layout":[["accept","reject"]],"primaryActions":["accept"],"scrollLock":true,"uiProfile":"balanced"},"mode":"banner"}}`,
			want:  "bea550f2f6980f42116a90db2160985178f75ef96d08331a1147530524abbbc2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sha256Hex(tt.input); got != tt.want {
				t.Errorf("sha256Hex(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestStableStringify(t *testing.T) {
	policy := Resolved{
		ID:    "policy_runtime_us_ca",
		Model: ModelOptIn,
		Consent: &ResolvedConsent{
			ExpiryDays: ptr(365),
			ScopeMode:  ScopeStrict,
			Categories: []string{"necessary", "measurement"},
		},
		UI: &ResolvedUI{
			Mode: ptr(UIModeBanner),
			Banner: &ResolvedUISurface{
				AllowedActions: []UIAction{ActionAccept, ActionReject},
				PrimaryActions: []UIAction{ActionAccept},
				Layout:         [][]UIAction{{ActionAccept, ActionReject}},
				Direction:      ptr(DirectionRow),
				UIProfile:      ptr(ProfileBalanced),
				ScrollLock:     ptr(true),
			},
		},
	}

	want := `{"consent":{"categories":["necessary","measurement"],"expiryDays":365,"scopeMode":"strict"},"id":"policy_runtime_us_ca","model":"opt-in","ui":{"banner":{"allowedActions":["accept","reject"],"direction":"row","layout":[["accept","reject"]],"primaryActions":["accept"],"scrollLock":true,"uiProfile":"balanced"},"mode":"banner"}}`

	got, err := stableStringify(policy)
	if err != nil {
		t.Fatalf("stableStringify: %v", err)
	}
	if got != want {
		t.Errorf("stableStringify mismatch\n got: %s\nwant: %s", got, want)
	}
}

func TestFingerprintIsStableAndHex(t *testing.T) {
	policy := Resolved{
		ID:      "p",
		Model:   ModelOptIn,
		Consent: &ResolvedConsent{ScopeMode: ScopePermissive},
	}

	first, err := Fingerprint(policy)
	if err != nil {
		t.Fatalf("Fingerprint: %v", err)
	}
	second, err := Fingerprint(policy)
	if err != nil {
		t.Fatalf("Fingerprint: %v", err)
	}

	if first != second {
		t.Errorf("fingerprint not stable: %q vs %q", first, second)
	}
	if len(first) != 64 {
		t.Errorf("fingerprint length = %d, want 64", len(first))
	}
	for _, r := range first {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')) {
			t.Fatalf("fingerprint %q contains non-hex character %q", first, r)
		}
	}
}

func TestMaterialFingerprintIgnoresPresentation(t *testing.T) {
	base := Resolved{
		ID:    "policy_runtime_us_ca",
		Model: ModelOptIn,
		I18n:  &I18n{Language: ptr("en"), MessageProfile: ptr("default")},
		Consent: &ResolvedConsent{
			ExpiryDays: ptr(365),
			ScopeMode:  ScopeStrict,
			Categories: []string{"necessary", "measurement"},
		},
		UI: &ResolvedUI{
			Mode: ptr(UIModeBanner),
			Banner: &ResolvedUISurface{
				AllowedActions: []UIAction{ActionAccept, ActionReject},
				PrimaryActions: []UIAction{ActionAccept},
				Layout:         [][]UIAction{{ActionAccept, ActionReject}},
				Direction:      ptr(DirectionRow),
				UIProfile:      ptr(ProfileBalanced),
				ScrollLock:     ptr(true),
			},
		},
	}

	variant := base
	variant.ID = "policy_runtime_us_ca_v2"
	variant.I18n = &I18n{Language: ptr("de"), MessageProfile: ptr("regional")}
	variant.UI = &ResolvedUI{
		Mode: ptr(UIModeBanner),
		Banner: &ResolvedUISurface{
			AllowedActions: []UIAction{ActionAccept, ActionReject},
			PrimaryActions: []UIAction{ActionAccept},
			Layout:         [][]UIAction{{ActionAccept, ActionReject}},
			Direction:      ptr(DirectionRow),
			UIProfile:      ptr(ProfileStrict),
			ScrollLock:     ptr(false),
		},
	}

	a, err := MaterialFingerprint(base)
	if err != nil {
		t.Fatalf("MaterialFingerprint: %v", err)
	}
	b, err := MaterialFingerprint(variant)
	if err != nil {
		t.Fatalf("MaterialFingerprint: %v", err)
	}

	if a != b {
		t.Errorf("presentation-only change altered material fingerprint: %q vs %q", a, b)
	}
}

func TestMaterialFingerprintTracksMaterialChanges(t *testing.T) {
	base := Resolved{
		ID:    "p",
		Model: ModelOptIn,
		Consent: &ResolvedConsent{
			ExpiryDays: ptr(365),
			ScopeMode:  ScopeStrict,
			Categories: []string{"necessary"},
		},
		UI: &ResolvedUI{
			Mode: ptr(UIModeBanner),
			Banner: &ResolvedUISurface{
				AllowedActions: []UIAction{ActionAccept, ActionReject},
				Layout:         [][]UIAction{{ActionAccept, ActionReject}},
				Direction:      ptr(DirectionRow),
			},
		},
	}

	baseline, err := MaterialFingerprint(base)
	if err != nil {
		t.Fatalf("MaterialFingerprint: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*Resolved)
	}{
		{
			name: "banner layout",
			mutate: func(p *Resolved) {
				p.UI = &ResolvedUI{
					Mode: ptr(UIModeBanner),
					Banner: &ResolvedUISurface{
						AllowedActions: []UIAction{ActionAccept, ActionReject},
						Layout:         [][]UIAction{{ActionReject, ActionAccept}},
						Direction:      ptr(DirectionRow),
					},
				}
			},
		},
		{
			name: "banner direction",
			mutate: func(p *Resolved) {
				p.UI = &ResolvedUI{
					Mode: ptr(UIModeBanner),
					Banner: &ResolvedUISurface{
						AllowedActions: []UIAction{ActionAccept, ActionReject},
						Layout:         [][]UIAction{{ActionAccept, ActionReject}},
						Direction:      ptr(DirectionColumn),
					},
				}
			},
		},
		{
			name: "consent expiry",
			mutate: func(p *Resolved) {
				p.Consent = &ResolvedConsent{
					ExpiryDays: ptr(90),
					ScopeMode:  ScopeStrict,
					Categories: []string{"necessary"},
				}
			},
		},
		{
			name: "consent categories",
			mutate: func(p *Resolved) {
				p.Consent = &ResolvedConsent{
					ExpiryDays: ptr(365),
					ScopeMode:  ScopeStrict,
					Categories: []string{"necessary", "marketing"},
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			variant := base
			tt.mutate(&variant)

			got, err := MaterialFingerprint(variant)
			if err != nil {
				t.Fatalf("MaterialFingerprint: %v", err)
			}
			if got == baseline {
				t.Errorf("material change to %s did not alter fingerprint", tt.name)
			}
		})
	}
}

func TestFingerprintIgnoresMatcherCasing(t *testing.T) {
	pack := func(country string) []Config {
		return []Config{{
			ID:      "p",
			Match:   MatchCountries([]string{country}),
			Consent: &ConsentConfig{Model: ptr(ModelOptIn)},
		}}
	}

	lower, err := Resolve(Request{Policies: pack("gb"), CountryCode: ptr("GB")})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	upper, err := Resolve(Request{Policies: pack("GB"), CountryCode: ptr("GB")})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	if lower == nil || upper == nil {
		t.Fatal("expected both packs to resolve")
	}
	if lower.Fingerprint != upper.Fingerprint {
		t.Errorf("casing changed fingerprint: %q vs %q", lower.Fingerprint, upper.Fingerprint)
	}
}

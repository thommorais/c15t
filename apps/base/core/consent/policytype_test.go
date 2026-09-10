package consent

import "testing"

func TestPolicyTypeValid(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "cookie banner", value: "cookie_banner", want: true},
		{name: "privacy policy", value: "privacy_policy", want: true},
		{name: "dpa", value: "dpa", want: true},
		{name: "terms", value: "terms_and_conditions", want: true},
		{name: "marketing communications", value: "marketing_communications", want: true},
		{name: "age verification", value: "age_verification", want: true},
		{name: "other", value: "other", want: true},
		{name: "suffixed legal document", value: "terms_and_conditions_b2c", want: true},
		{name: "suffixed privacy policy", value: "privacy_policy_eu", want: true},
		{name: "unknown", value: "shrug", want: false},
		{name: "empty", value: "", want: false},
		{name: "suffixed dpa", value: "dpa_extra", want: true},
		{name: "suffix without underscore boundary", value: "terms_and_conditions2", want: false},
		{name: "empty suffix", value: "terms_and_conditions_", want: false},
		{name: "cookie banner takes no suffix", value: "cookie_banner_extra", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidPolicyType(tt.value); got != tt.want {
				t.Errorf("ValidPolicyType(%q) = %v, want %v", tt.value, got, tt.want)
			}
		})
	}
}

func TestDefaultPolicyType(t *testing.T) {
	if !ValidPolicyType(DefaultPolicyType) {
		t.Errorf("DefaultPolicyType %q is not a valid type", DefaultPolicyType)
	}
}

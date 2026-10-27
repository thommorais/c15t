package policyrule

import "slices"

// LegacyMaterial is a frozen 2.x preset input. Pointers keep an absent field
// apart from an empty one, as the material fingerprint hashes them
// differently.
type LegacyMaterial struct {
	Input             LegacyInput `json:"input"`
	PolicyFingerprint string      `json:"policyFingerprint"`
}

type LegacyInput struct {
	Model   string         `json:"model"`
	Consent *LegacyConsent `json:"consent,omitempty"`
	Proof   *LegacyProof   `json:"proof,omitempty"`
	UI      *LegacyUI      `json:"ui,omitempty"`
}

type LegacyConsent struct {
	Categories            *[]string `json:"categories,omitempty"`
	ExpiryDays            *float64  `json:"expiryDays,omitempty"`
	GPC                   *bool     `json:"gpc,omitempty"`
	PreselectedCategories *[]string `json:"preselectedCategories,omitempty"`
	ScopeMode             *string   `json:"scopeMode,omitempty"`
}

type LegacyProof struct {
	StoreIP        *bool `json:"storeIp,omitempty"`
	StoreUserAgent *bool `json:"storeUserAgent,omitempty"`
	StoreLanguage  *bool `json:"storeLanguage,omitempty"`
}

type LegacyUI struct {
	Mode   *string        `json:"mode,omitempty"`
	Banner *LegacySurface `json:"banner,omitempty"`
	Dialog *LegacySurface `json:"dialog,omitempty"`
}

type LegacySurface struct {
	AllowedActions *[]string `json:"allowedActions,omitempty"`
	PrimaryActions *[]string `json:"primaryActions,omitempty"`
	Layout         *[]any    `json:"layout,omitempty"`
	Direction      *string   `json:"direction,omitempty"`
}

func (l *LegacyMaterial) valid() bool {
	if l.PolicyFingerprint == "" || !slices.Contains(ruleModels, l.Input.Model) {
		return false
	}
	if c := l.Input.Consent; c != nil && c.ScopeMode != nil && *c.ScopeMode != ScopeStrict && *c.ScopeMode != ScopePermissive {
		return false
	}
	if ui := l.Input.UI; ui != nil {
		if ui.Mode != nil && !slices.Contains([]string{"none", "banner", "dialog"}, *ui.Mode) {
			return false
		}
		for _, s := range []*LegacySurface{ui.Banner, ui.Dialog} {
			if s != nil && s.Direction != nil && *s.Direction != "row" && *s.Direction != "column" {
				return false
			}
		}
	}
	return true
}

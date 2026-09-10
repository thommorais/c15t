// Package policy resolves which consent policy applies to a request.
//
// A policy pack is an ordered slice of Config. Resolution has fixed precedence:
// region, then country, then fallback (only when the country is unknown), then
// default. Within a matcher type the first match wins by slice order.
package policy

type Model string

const (
	ModelOptIn  Model = "opt-in"
	ModelOptOut Model = "opt-out"
	ModelNone   Model = "none"
	ModelIAB    Model = "iab"
)

// ScopeMode strict keeps out-of-scope categories blocked and makes the backend
// reject consent writes for them; permissive leaves them unblocked.
type ScopeMode string

const (
	ScopePermissive ScopeMode = "permissive"
	ScopeStrict     ScopeMode = "strict"
)

type UIMode string

const (
	UIModeNone   UIMode = "none"
	UIModeBanner UIMode = "banner"
	UIModeDialog UIMode = "dialog"
)

type UIAction string

const (
	ActionAccept    UIAction = "accept"
	ActionReject    UIAction = "reject"
	ActionCustomize UIAction = "customize"
)

type Direction string

const (
	DirectionRow    Direction = "row"
	DirectionColumn Direction = "column"
)

type UIProfile string

const (
	ProfileBalanced UIProfile = "balanced"
	ProfileCompact  UIProfile = "compact"
	ProfileStrict   UIProfile = "strict"
)

type MatchedBy string

const (
	MatchedByRegion   MatchedBy = "region"
	MatchedByCountry  MatchedBy = "country"
	MatchedByFallback MatchedBy = "fallback"
	MatchedByDefault  MatchedBy = "default"
)

const CategoryWildcard = "*"

type Region struct {
	Country string `json:"country"`
	Region  string `json:"region"`
}

// Fallback applies only when the request's country is unknown. IsDefault is the
// catch-all used when a known country matches nothing.
type Match struct {
	Regions   []Region `json:"regions,omitempty"`
	Countries []string `json:"countries,omitempty"`
	IsDefault bool     `json:"isDefault,omitempty"`
	Fallback  bool     `json:"fallback,omitempty"`
}

type I18n struct {
	Language       *string `json:"language,omitempty"`
	MessageProfile *string `json:"messageProfile,omitempty"`
}

type ConsentConfig struct {
	Model                 *Model     `json:"model,omitempty"`
	ExpiryDays            *int       `json:"expiryDays,omitempty"`
	ScopeMode             *ScopeMode `json:"scopeMode,omitempty"`
	Categories            []string   `json:"categories,omitempty"`
	PreselectedCategories []string   `json:"preselectedCategories,omitempty"`
	GPC                   *bool      `json:"gpc,omitempty"`
}

type UISurfaceConfig struct {
	AllowedActions []UIAction   `json:"allowedActions,omitempty"`
	PrimaryActions []UIAction   `json:"primaryActions,omitempty"`
	Layout         [][]UIAction `json:"layout,omitempty"`
	Direction      *Direction   `json:"direction,omitempty"`
	UIProfile      *UIProfile   `json:"uiProfile,omitempty"`
	ScrollLock     *bool        `json:"scrollLock,omitempty"`
}

type UIConfig struct {
	Mode   *UIMode          `json:"mode,omitempty"`
	Banner *UISurfaceConfig `json:"banner,omitempty"`
	Dialog *UISurfaceConfig `json:"dialog,omitempty"`
}

type ProofConfig struct {
	StoreIP        *bool `json:"storeIp,omitempty"`
	StoreUserAgent *bool `json:"storeUserAgent,omitempty"`
	StoreLanguage  *bool `json:"storeLanguage,omitempty"`
}

type Config struct {
	ID      string         `json:"id"`
	Match   Match          `json:"match"`
	I18n    *I18n          `json:"i18n,omitempty"`
	Consent *ConsentConfig `json:"consent,omitempty"`
	UI      *UIConfig      `json:"ui,omitempty"`
	Proof   *ProofConfig   `json:"proof,omitempty"`
}

type ResolvedConsent struct {
	ExpiryDays            *int      `json:"expiryDays,omitempty"`
	ScopeMode             ScopeMode `json:"scopeMode"`
	Categories            []string  `json:"categories,omitempty"`
	PreselectedCategories []string  `json:"preselectedCategories,omitempty"`
	GPC                   *bool     `json:"gpc,omitempty"`
}

type ResolvedUISurface struct {
	AllowedActions []UIAction   `json:"allowedActions,omitempty"`
	PrimaryActions []UIAction   `json:"primaryActions,omitempty"`
	Layout         [][]UIAction `json:"layout,omitempty"`
	Direction      *Direction   `json:"direction,omitempty"`
	UIProfile      *UIProfile   `json:"uiProfile,omitempty"`
	ScrollLock     *bool        `json:"scrollLock,omitempty"`
}

// Absent for IAB policies, where TCF fixes the surface behaviour.
type ResolvedUI struct {
	Mode   *UIMode            `json:"mode,omitempty"`
	Banner *ResolvedUISurface `json:"banner,omitempty"`
	Dialog *ResolvedUISurface `json:"dialog,omitempty"`
}

type Resolved struct {
	ID      string           `json:"id"`
	Model   Model            `json:"model"`
	I18n    *I18n            `json:"i18n,omitempty"`
	Consent *ResolvedConsent `json:"consent,omitempty"`
	UI      *ResolvedUI      `json:"ui,omitempty"`
	Proof   *ProofConfig     `json:"proof,omitempty"`
}

type Decision struct {
	Policy      Resolved
	MatchedBy   MatchedBy
	Fingerprint string
}

type ValidationResult struct {
	Errors   []string
	Warnings []string
}

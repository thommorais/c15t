package policyrule

const (
	ModelOptIn  = "opt-in"
	ModelOptOut = "opt-out"
	ModelIAB    = "iab"
	ModelNone   = "none"

	PromptChoice = "choice"
	PromptNotice = "notice"
	PromptNone   = "none"

	ScopeStrict     = "strict"
	ScopePermissive = "permissive"

	DefaultChoiceValidityDays = 365
	DefaultNoticeValidityDays = 365

	dayMs            = 86_400_000
	maxSafeInteger   = 1<<53 - 1
	categoryWildcard = "*"
)

var (
	consentCategories  = []string{"necessary", "functionality", "experience", "measurement", "marketing"}
	optionalCategories = []string{"experience", "functionality", "marketing", "measurement"}
	ruleModels         = []string{ModelOptIn, ModelOptOut, ModelIAB, ModelNone}
	prompts            = []string{PromptChoice, PromptNotice, PromptNone}
	rights             = []string{"disclosure", "preferences", "opt-out"}
	modelPrompts       = map[string][]string{
		ModelIAB:    {PromptChoice},
		ModelNone:   {PromptNone},
		ModelOptIn:  {PromptChoice},
		ModelOptOut: {PromptChoice, PromptNotice, PromptNone},
	}
	choiceActions = []string{"accept", "reject", "customize"}
)

// PolicyRule is author input. A nil slice or pointer is an absent field, which
// the reference treats differently from an empty one.
type PolicyRule struct {
	LegacyMaterial        *LegacyMaterial `json:"legacyMaterial,omitempty"`
	ID                    string          `json:"id"`
	Match                 *Match          `json:"match"`
	Model                 string          `json:"model"`
	Prompt                string          `json:"prompt"`
	Categories            []string        `json:"categories,omitempty"`
	ScopeMode             string          `json:"scopeMode,omitempty"`
	PreselectedCategories []string        `json:"preselectedCategories,omitempty"`
	Actions               []string        `json:"actions,omitempty"`
	Rights                []string        `json:"rights,omitempty"`
	Validity              *Validity       `json:"validity,omitempty"`
	PrivacySignals        *PrivacySignals `json:"privacySignals,omitempty"`
	CopyRevision          string          `json:"copyRevision,omitempty"`
	I18n                  *I18n           `json:"i18n,omitempty"`
	Proof                 *Proof          `json:"proof,omitempty"`
	Review                *Review         `json:"review,omitempty"`
}

type Match struct {
	Regions         []Region `json:"regions,omitempty"`
	Countries       []string `json:"countries,omitempty"`
	RegionFallbacks []string `json:"regionFallbacks,omitempty"`
	IsDefault       bool     `json:"isDefault,omitempty"`
	Fallback        bool     `json:"fallback,omitempty"`
}

type Region struct {
	Country string `json:"country"`
	Region  string `json:"region"`
}

type Validity struct {
	ChoiceDays *float64 `json:"choiceDays,omitempty"`
	NoticeDays *float64 `json:"noticeDays,omitempty"`
}

type PrivacySignals struct {
	GPC *GPC `json:"gpc,omitempty"`
}

type GPC struct {
	DenyCategories []string `json:"denyCategories"`
}

type I18n struct {
	Language       string `json:"language,omitempty"`
	MessageProfile string `json:"messageProfile,omitempty"`
}

type Proof struct {
	StoreIP        bool `json:"storeIp"`
	StoreUserAgent bool `json:"storeUserAgent"`
	StoreLanguage  bool `json:"storeLanguage"`
}

type Review struct {
	Status      string   `json:"status"`
	ReviewedOn  string   `json:"reviewedOn,omitempty"`
	ReviewBy    string   `json:"reviewBy,omitempty"`
	Sources     []string `json:"sources,omitempty"`
	Assumptions []string `json:"assumptions,omitempty"`
}

type ActionConstraints struct {
	Allowed    []string   `json:"allowed"`
	Equivalent [][]string `json:"equivalent"`
	Required   []string   `json:"required"`
}

type ResolvedValidity struct {
	ChoiceMs float64 `json:"choiceMs"`
	NoticeMs float64 `json:"noticeMs"`
}

type ResolvedPrivacySignals struct {
	GPC GPC `json:"gpc"`
}

type ResolvedPolicyRule struct {
	Actions               ActionConstraints      `json:"actions"`
	CopyRevision          *string                `json:"copyRevision"`
	I18n                  *I18n                  `json:"i18n,omitempty"`
	ID                    string                 `json:"id"`
	Model                 string                 `json:"model"`
	PreselectedCategories []string               `json:"preselectedCategories"`
	PrivacySignals        ResolvedPrivacySignals `json:"privacySignals"`
	Prompt                string                 `json:"prompt"`
	Proof                 Proof                  `json:"proof"`
	Rights                []string               `json:"rights"`
	Scope                 []string               `json:"scope"`
	ScopeMode             string                 `json:"scopeMode"`
	Validity              ResolvedValidity       `json:"validity"`
}

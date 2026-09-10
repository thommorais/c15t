package consent

import (
	"slices"
	"strings"
)

const (
	PolicyTypeCookieBanner            = "cookie_banner"
	PolicyTypePrivacyPolicy           = "privacy_policy"
	PolicyTypeDPA                     = "dpa"
	PolicyTypeTermsAndConditions      = "terms_and_conditions"
	PolicyTypeMarketingCommunications = "marketing_communications"
	PolicyTypeAgeVerification         = "age_verification"
	PolicyTypeOther                   = "other"
)

var policyTypes = []string{
	PolicyTypeCookieBanner,
	PolicyTypePrivacyPolicy,
	PolicyTypeDPA,
	PolicyTypeTermsAndConditions,
	PolicyTypeMarketingCommunications,
	PolicyTypeAgeVerification,
	PolicyTypeOther,
}

// These families also accept a suffixed variant, such as
// terms_and_conditions_b2b, to version a document per audience.
var legalDocumentPrefixes = []string{
	PolicyTypePrivacyPolicy,
	PolicyTypeDPA,
	PolicyTypeTermsAndConditions,
}

// DefaultPolicyType is what a runtime consent record is filed under when the
// caller names no document.
const DefaultPolicyType = PolicyTypeCookieBanner

func ValidPolicyType(value string) bool {
	if slices.Contains(policyTypes, value) {
		return true
	}
	return isLegalDocumentType(value)
}

func isLegalDocumentType(value string) bool {
	for _, prefix := range legalDocumentPrefixes {
		if value == prefix {
			return true
		}
		if strings.HasPrefix(value, prefix+"_") && len(value) > len(prefix)+1 {
			return true
		}
	}
	return false
}

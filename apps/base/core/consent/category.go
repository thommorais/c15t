package consent

import "slices"

const (
	CategoryNecessary     = "necessary"
	CategoryFunctionality = "functionality"
	CategoryMeasurement   = "measurement"
	CategoryExperience    = "experience"
	CategoryMarketing     = "marketing"
)

var Categories = []string{
	CategoryNecessary,
	CategoryFunctionality,
	CategoryMeasurement,
	CategoryExperience,
	CategoryMarketing,
}

func ValidCategory(code string) bool {
	return slices.Contains(Categories, code)
}

// Necessary covers what the service cannot operate without, so it needs no
// consent and is granted regardless of the subject's choices.
func DefaultGranted(category string) bool {
	return category == CategoryNecessary
}

func GPCWithdraws(category string) bool {
	return slices.Contains(GPCCategories, category)
}

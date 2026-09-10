package consent

import "testing"

func TestCategoriesTaxonomy(t *testing.T) {
	want := []string{"necessary", "functionality", "measurement", "experience", "marketing"}

	if !equalStrings(Categories, want) {
		t.Errorf("Categories = %v, want %v", Categories, want)
	}
}

func TestCategoryValid(t *testing.T) {
	for _, c := range Categories {
		if !ValidCategory(c) {
			t.Errorf("%q reported invalid", c)
		}
	}
	if ValidCategory("telepathy") {
		t.Error("unknown category reported valid")
	}
}

func TestNecessaryIsAlwaysGranted(t *testing.T) {
	if !DefaultGranted(CategoryNecessary) {
		t.Error("necessary must default to granted")
	}

	for _, c := range Categories {
		if c == CategoryNecessary {
			continue
		}
		if DefaultGranted(c) {
			t.Errorf("%q must not default to granted", c)
		}
	}
}

func TestGPCAffectsMarketingAndMeasurement(t *testing.T) {
	want := map[string]bool{
		CategoryNecessary:     false,
		CategoryFunctionality: false,
		CategoryExperience:    false,
		CategoryMeasurement:   true,
		CategoryMarketing:     true,
	}

	for category, affected := range want {
		if got := GPCWithdraws(category); got != affected {
			t.Errorf("GPCWithdraws(%q) = %v, want %v", category, got, affected)
		}
	}
}

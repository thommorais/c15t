package policyrule

import (
	"encoding/json"
	"os"
	"testing"
)

type fingerprintVectors struct {
	Pairs []struct {
		Left  string `json:"left"`
		Right string `json:"right"`
		Sign  int    `json:"sign"`
	} `json:"pairs"`
	Vectors []struct {
		Value       json.RawMessage `json:"value"`
		Canonical   string          `json:"canonical"`
		Fingerprint string          `json:"fingerprint"`
	} `json:"vectors"`
}

func loadFingerprintVectors(t *testing.T) fingerprintVectors {
	t.Helper()
	raw, err := os.ReadFile("testdata/fingerprint.json")
	if err != nil {
		t.Fatal(err)
	}
	var v fingerprintVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func sign(n int) int {
	switch {
	case n < 0:
		return -1
	case n > 0:
		return 1
	}
	return 0
}

func TestCompareCanonicalMatchesReference(t *testing.T) {
	for _, p := range loadFingerprintVectors(t).Pairs {
		if got := sign(compareCanonical(p.Left, p.Right)); got != p.Sign {
			t.Errorf("compareCanonical(%q, %q) = %d, want %d", p.Left, p.Right, got, p.Sign)
		}
	}
}

func TestCanonicalMatchesReference(t *testing.T) {
	for _, v := range loadFingerprintVectors(t).Vectors {
		got, err := Canonical(v.Value)
		if err != nil {
			t.Fatalf("Canonical(%s): %v", v.Value, err)
		}
		if got != v.Canonical {
			t.Errorf("Canonical(%s)\n got %s\nwant %s", v.Value, got, v.Canonical)
		}
	}
}

func TestFingerprintMatchesReference(t *testing.T) {
	for _, v := range loadFingerprintVectors(t).Vectors {
		got, err := Fingerprint(v.Value)
		if err != nil {
			t.Fatalf("Fingerprint(%s): %v", v.Value, err)
		}
		if got != v.Fingerprint {
			t.Errorf("Fingerprint(%s) = %s, want %s", v.Value, got, v.Fingerprint)
		}
	}
}

func TestCanonicalDropsOmittedFieldsAndKeepsNull(t *testing.T) {
	type rule struct {
		CopyRevision *string `json:"copyRevision"`
		Language     string  `json:"language,omitempty"`
		ID           string  `json:"id"`
	}

	got, err := Canonical(rule{ID: "world_none"})
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"copyRevision":null,"id":"world_none"}`; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestCanonicalRefusesKeysOutsidePrintableASCII(t *testing.T) {
	for _, key := range []string{"é", "a\t", "日本"} {
		if _, err := Canonical(map[string]int{key: 1}); err == nil {
			t.Errorf("Canonical accepted key %q", key)
		}
	}
}

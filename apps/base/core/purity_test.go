package core_test

import (
	"os/exec"
	"strings"
	"testing"
)

// The core packages hold the consent rules and must stay independent of
// PocketBase and any other third-party dependency so they remain testable in
// isolation and portable to a different host.
func TestCoreHasNoThirdPartyImports(t *testing.T) {
	out, err := exec.Command("go", "list", "-deps", "./...").Output()
	if err != nil {
		t.Fatalf("go list: %v", err)
	}

	for dep := range strings.FieldsSeq(string(out)) {
		if strings.HasPrefix(dep, "thom/") {
			continue
		}
		// Third-party paths carry a dotted domain in their first segment;
		// standard library paths never do.
		if first, _, _ := strings.Cut(dep, "/"); strings.Contains(first, ".") {
			t.Errorf("core depends on third-party package %q", dep)
		}
	}
}

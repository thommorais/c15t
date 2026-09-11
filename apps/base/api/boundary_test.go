package api

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Files permitted to reach the app directly: the wrapper itself, and auth,
// which reads the unscoped apiKey collection before a tenant exists.
var boundaryExempt = map[string]bool{
	"scope.go": true,
	"auth.go":  true,
}

// Methods that read or write records. Reaching for one outside the wrapper
// bypasses tenant scoping, which is the failure this package exists to prevent.
var unscopedDBMethods = map[string]bool{
	"FindRecordById":          true,
	"FindFirstRecordByFilter": true,
	"FindRecordsByFilter":     true,
	"FindAllRecords":          true,
	"RunInTransaction":        true,
}

func TestHandlersCannotBypassTenantScoping(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read package dir: %v", err)
	}

	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		if boundaryExempt[name] {
			continue
		}

		t.Run(name, func(t *testing.T) {
			fset := token.NewFileSet()
			file, err := parser.ParseFile(fset, filepath.Join(".", name), nil, 0)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}

			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}

				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || !unscopedDBMethods[sel.Sel.Name] {
					return true
				}

				// Calls on the scope itself are the sanctioned path.
				if receiver, ok := sel.X.(*ast.Ident); ok && receiver.Name == "s" {
					return true
				}

				t.Errorf(
					"%s calls %s directly, bypassing tenant scoping; use the scope from Ctx.DB() instead",
					fset.Position(call.Pos()), sel.Sel.Name,
				)
				return true
			})
		})
	}
}

func TestCreatesGoThroughTheScope(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read package dir: %v", err)
	}

	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		if boundaryExempt[name] {
			continue
		}

		t.Run(name, func(t *testing.T) {
			fset := token.NewFileSet()
			file, err := parser.ParseFile(fset, filepath.Join(".", name), nil, 0)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}

			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}

				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || sel.Sel.Name != "NewRecord" {
					return true
				}

				t.Errorf(
					"%s builds a record directly, so it is not stamped with the tenant; use scope.New instead",
					fset.Position(call.Pos()),
				)
				return true
			})
		})
	}
}

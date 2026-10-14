package api

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"sort"
	"strconv"
	"strings"
	"testing"
)

var routeMethods = map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true}

// registeredRoutes reads routes.go for g.<METHOD>("path", ...) calls, so the
// spec is checked against what is actually served.
func registeredRoutes(t *testing.T) []string {
	t.Helper()

	file, err := parser.ParseFile(token.NewFileSet(), "routes.go", nil, 0)
	if err != nil {
		t.Fatalf("parse routes.go: %v", err)
	}

	var routes []string
	ast.Inspect(file, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok || len(call.Args) == 0 {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || !routeMethods[sel.Sel.Name] {
			return true
		}
		if recv, ok := sel.X.(*ast.Ident); !ok || recv.Name != "g" {
			return true
		}
		lit, ok := call.Args[0].(*ast.BasicLit)
		if !ok {
			return true
		}
		path, err := strconv.Unquote(lit.Value)
		if err != nil {
			t.Fatalf("route path %s: %v", lit.Value, err)
		}
		routes = append(routes, sel.Sel.Name+" /api/c15t"+path)
		return true
	})

	sort.Strings(routes)
	return routes
}

func specRoutes(t *testing.T) []string {
	t.Helper()

	var spec struct {
		OpenAPI string `json:"openapi"`
		Info    struct {
			Version string `json:"version"`
		} `json:"info"`
		Paths map[string]map[string]any `json:"paths"`
	}
	if err := json.Unmarshal(openAPISpec, &spec); err != nil {
		t.Fatalf("openapi.json is not valid JSON: %v", err)
	}
	if !strings.HasPrefix(spec.OpenAPI, "3.") {
		t.Fatalf("openapi = %q, want a 3.x document", spec.OpenAPI)
	}
	if spec.Info.Version != Version {
		t.Errorf("info.version = %q, want %q, the version /status reports", spec.Info.Version, Version)
	}

	var routes []string
	for path, operations := range spec.Paths {
		for method := range operations {
			if routeMethods[strings.ToUpper(method)] {
				routes = append(routes, strings.ToUpper(method)+" "+path)
			}
		}
	}

	sort.Strings(routes)
	return routes
}

func TestOpenAPISpecMatchesTheRoutes(t *testing.T) {
	registered, documented := registeredRoutes(t), specRoutes(t)
	if len(registered) == 0 {
		t.Fatal("found no routes in routes.go")
	}

	in := func(list []string, route string) bool {
		i := sort.SearchStrings(list, route)
		return i < len(list) && list[i] == route
	}
	for _, route := range registered {
		if !in(documented, route) {
			t.Errorf("%s is served but not in openapi.json", route)
		}
	}
	for _, route := range documented {
		if !in(registered, route) {
			t.Errorf("%s is in openapi.json but not served", route)
		}
	}
}

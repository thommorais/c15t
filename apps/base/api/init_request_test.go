package api

import (
	"net/http/httptest"
	"testing"
)

func TestInitParamsMatchSchema(t *testing.T) {
	r := httptest.NewRequest("GET", "/init?v=3&contract=1&country=US&region=CA&gpc=0", nil)
	r.Header.Set("x-c15t-country", "DE")
	r.Header.Set("sec-gpc", "1")
	got := initRequest(r)
	if got.Header.Get("x-c15t-country") != "US" || got.Header.Get("x-c15t-region") != "CA" || got.Header.Get("x-c15t-policy-contract") != "1" {
		t.Fatal(got.Header)
	}
	if signal := gpcSignal(got); signal == nil || *signal {
		t.Fatal("explicit false must override Sec-GPC")
	}
	if r.Header.Get("x-c15t-country") != "DE" {
		t.Fatal("changed the original request")
	}
	for _, query := range []string{"", "?country=&gpc=", "?gpc=yes"} {
		r := httptest.NewRequest("GET", "/init"+query, nil)
		if gpcSignal(initRequest(r)) != nil {
			t.Fatal("absent or invalid GPC became false")
		}
		r.Header.Set("x-c15t-country", "DE")
		r.Header.Set("sec-gpc", "1")
		copy := initRequest(r)
		if copy.Header.Get("x-c15t-country") != "DE" || !hasGPCSignal(copy) {
			t.Fatal("empty/invalid parameter replaced a header")
		}
	}
}

package api

import "net/http"

// initRequest mirrors @c15t/schema's applyInitParamsToHeaders. Empty values
// leave the original header intact, and only 0 and 1 override GPC.
func initRequest(r *http.Request) *http.Request {
	copy := r.Clone(r.Context())
	for param, header := range map[string]string{
		"v": "x-c15t-version", "contract": "x-c15t-policy-contract",
		"country": "x-c15t-country", "region": "x-c15t-region",
		"gpc": "x-c15t-gpc", "experiment": "x-c15t-experiment",
	} {
		value := r.URL.Query().Get(param)
		if value == "" || (param == "gpc" && value != "0" && value != "1") {
			continue
		}
		copy.Header.Set(header, value)
	}
	return copy
}

type privacySignals struct {
	GPC *bool `json:"gpc,omitempty"`
}

func gpcSignal(r *http.Request) *bool {
	for _, name := range []string{"x-c15t-gpc", "sec-gpc"} {
		if value := r.Header.Get(name); value != "" {
			if value == "1" || value == "0" {
				gpc := value == "1"
				return &gpc
			}
			return nil
		}
	}
	return nil
}

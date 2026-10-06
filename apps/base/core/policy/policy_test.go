package policy

import "testing"

func TestProofConfigDefaultsToKeepingEvidence(t *testing.T) {
	yes, no := true, false

	tests := []struct {
		name      string
		proof     *ProofConfig
		wantIP    bool
		wantAgent bool
	}{
		{name: "nil config", proof: nil, wantIP: true, wantAgent: true},
		{name: "empty config", proof: &ProofConfig{}, wantIP: true, wantAgent: true},
		{name: "explicit true", proof: &ProofConfig{StoreIP: &yes, StoreUserAgent: &yes}, wantIP: true, wantAgent: true},
		{name: "ip off", proof: &ProofConfig{StoreIP: &no}, wantIP: false, wantAgent: true},
		{name: "agent off", proof: &ProofConfig{StoreUserAgent: &no}, wantIP: true, wantAgent: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.proof.StoresIP(); got != tt.wantIP {
				t.Errorf("StoresIP = %v, want %v", got, tt.wantIP)
			}
			if got := tt.proof.StoresUserAgent(); got != tt.wantAgent {
				t.Errorf("StoresUserAgent = %v, want %v", got, tt.wantAgent)
			}
		})
	}
}

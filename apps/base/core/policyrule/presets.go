package policyrule

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"slices"
	"sync"
)

//go:embed presets.json
var presetsJSON []byte

type presetData struct {
	Presets     map[string]PolicyRule `json:"presets"`
	Recommended struct {
		Default []PolicyRule `json:"default"`
		IAB     []PolicyRule `json:"iab"`
	} `json:"recommended"`
}

var loadPresets = sync.OnceValue(func() presetData {
	var d presetData
	dec := json.NewDecoder(bytes.NewReader(presetsJSON))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&d); err != nil {
		panic("policyrule: presets.json: " + err.Error())
	}
	return d
})

// clone goes through JSON so a caller cannot reach the embedded slices.
func clone[T any](v T) T {
	raw, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		panic(err)
	}
	return out
}

func PresetNames() []string {
	names := make([]string, 0, len(loadPresets().Presets))
	for name := range loadPresets().Presets {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func Preset(name string) (PolicyRule, bool) {
	rule, ok := loadPresets().Presets[name]
	if !ok {
		return PolicyRule{}, false
	}
	return clone(rule), true
}

// RecommendedRules is the pack local() resolves when the host passes none.
func RecommendedRules(iab bool) []PolicyRule {
	if iab {
		return clone(loadPresets().Recommended.IAB)
	}
	return clone(loadPresets().Recommended.Default)
}

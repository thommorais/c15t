package policy

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Fingerprint hashes the whole resolved policy.
func Fingerprint(p Resolved) (string, error) {
	s, err := stableStringify(p)
	if err != nil {
		return "", err
	}
	return sha256Hex(s), nil
}

// MaterialFingerprint hashes only the fields that change consent semantics, so
// presentation-only edits do not invalidate stored consent.
func MaterialFingerprint(p Resolved) (string, error) {
	s, err := stableStringify(materialView(p))
	if err != nil {
		return "", err
	}
	return sha256Hex(s), nil
}

func sha256Hex(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}

func materialView(p Resolved) map[string]any {
	view := map[string]any{"model": p.Model}

	if p.Consent != nil {
		view["consent"] = map[string]any{
			"expiryDays":            p.Consent.ExpiryDays,
			"scopeMode":             p.Consent.ScopeMode,
			"categories":            p.Consent.Categories,
			"preselectedCategories": p.Consent.PreselectedCategories,
			"gpc":                   p.Consent.GPC,
		}
	}

	if p.UI != nil {
		ui := map[string]any{"mode": p.UI.Mode}
		if p.UI.Banner != nil {
			ui["banner"] = materialSurface(p.UI.Banner)
		}
		if p.UI.Dialog != nil {
			ui["dialog"] = materialSurface(p.UI.Dialog)
		}
		view["ui"] = ui
	}

	if p.Proof != nil {
		view["proof"] = map[string]any{
			"storeIp":        p.Proof.StoreIP,
			"storeUserAgent": p.Proof.StoreUserAgent,
			"storeLanguage":  p.Proof.StoreLanguage,
		}
	}

	return view
}

func materialSurface(s *ResolvedUISurface) map[string]any {
	return map[string]any{
		"allowedActions": s.AllowedActions,
		"primaryActions": s.PrimaryActions,
		"layout":         s.Layout,
		"direction":      s.Direction,
	}
}

// stableStringify serialises a value deterministically: nil-valued keys are
// omitted, object keys sorted, array order preserved. It mirrors the reference
// implementation so fingerprints stay comparable across both.
func stableStringify(v any) (string, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}

	var generic any
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	if err := dec.Decode(&generic); err != nil {
		return "", err
	}

	var sb strings.Builder
	if err := writeStable(&sb, generic); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func writeStable(sb *strings.Builder, v any) error {
	switch t := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		sb.WriteString(strconv.FormatBool(t))
	case json.Number:
		sb.WriteString(t.String())
	case string:
		return writeJSONString(sb, t)
	case []any:
		sb.WriteByte('[')
		for i, item := range t {
			if i > 0 {
				sb.WriteByte(',')
			}
			if err := writeStable(sb, item); err != nil {
				return err
			}
		}
		sb.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			if t[k] == nil {
				continue
			}
			keys = append(keys, k)
		}
		sort.Strings(keys)

		sb.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				sb.WriteByte(',')
			}
			if err := writeJSONString(sb, k); err != nil {
				return err
			}
			sb.WriteByte(':')
			if err := writeStable(sb, t[k]); err != nil {
				return err
			}
		}
		sb.WriteByte('}')
	default:
		return fmt.Errorf("stableStringify: unsupported type %T", v)
	}

	return nil
}

func writeJSONString(sb *strings.Builder, s string) error {
	encoded, err := json.Marshal(s)
	if err != nil {
		return err
	}
	sb.Write(encoded)
	return nil
}

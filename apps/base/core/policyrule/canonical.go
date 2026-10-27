// Package policyrule ports the c15t v3 policy rule model.
package policyrule

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

func Fingerprint(v any) (string, error) {
	s, err := Canonical(v)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:]), nil
}

// Canonical matches the reference stableStringify. Keys outside printable
// ASCII are refused: the reference orders them by ICU collation.
func Canonical(v any) (string, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var generic any
	if err := dec.Decode(&generic); err != nil {
		return "", err
	}
	var sb strings.Builder
	if err := writeCanonical(&sb, generic); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func writeCanonical(sb *strings.Builder, v any) error {
	switch t := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		sb.WriteString(strconv.FormatBool(t))
	case json.Number:
		return writeNumber(sb, t)
	case string:
		writeString(sb, t)
	case []any:
		sb.WriteByte('[')
		for i, item := range t {
			if i > 0 {
				sb.WriteByte(',')
			}
			if err := writeCanonical(sb, item); err != nil {
				return err
			}
		}
		sb.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			if !isPrintableASCII(k) {
				return fmt.Errorf("policyrule: key %q is not printable ASCII", k)
			}
			keys = append(keys, k)
		}
		slices.SortFunc(keys, compareCanonical)
		sb.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				sb.WriteByte(',')
			}
			writeString(sb, k)
			sb.WriteByte(':')
			if err := writeCanonical(sb, t[k]); err != nil {
				return err
			}
		}
		sb.WriteByte('}')
	default:
		return fmt.Errorf("policyrule: unsupported type %T", v)
	}
	return nil
}

// encoding/json formats float64 with JavaScript's rules.
func writeNumber(sb *strings.Builder, n json.Number) error {
	f, err := n.Float64()
	if err != nil {
		return err
	}
	out, err := json.Marshal(f)
	if err != nil {
		return err
	}
	sb.Write(out)
	return nil
}

// Escapes as JSON.stringify does; encoding/json also escapes <, >, &, U+2028
// and U+2029.
func writeString(sb *strings.Builder, s string) {
	const hexDigits = "0123456789abcdef"
	sb.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		i += size
		switch r {
		case '"':
			sb.WriteString(`\"`)
		case '\\':
			sb.WriteString(`\\`)
		case '\b':
			sb.WriteString(`\b`)
		case '\f':
			sb.WriteString(`\f`)
		case '\n':
			sb.WriteString(`\n`)
		case '\r':
			sb.WriteString(`\r`)
		case '\t':
			sb.WriteString(`\t`)
		default:
			if r < 0x20 {
				sb.WriteString(`\u00`)
				sb.WriteByte(hexDigits[r>>4])
				sb.WriteByte(hexDigits[r&0xf])
				continue
			}
			sb.WriteRune(r)
		}
	}
	sb.WriteByte('"')
}

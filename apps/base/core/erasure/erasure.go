// Package erasure decides what an erasure request removes. Personal data about
// a visitor is cleared or reduced; the consent itself stays as proof of what
// was agreed, attached to a subject id that no longer names anyone.
package erasure

import (
	"fmt"
	"sort"
	"strings"

	"thom/core/consent"
)

// Mode is what erasure does with a visitor's rows. Anonymise keeps each
// consent as proof with nothing that names the visitor; Delete removes the
// rows, for a client whose counsel requires it.
type Mode string

const (
	Anonymise Mode = "anonymise"
	Delete    Mode = "delete"
)

// ParseMode reads a configured mode. Empty is Anonymise, and the US spelling
// is accepted.
func ParseMode(raw string) (Mode, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "anonymise", "anonymize":
		return Anonymise, nil
	case "delete":
		return Delete, nil
	}
	return "", fmt.Errorf("%q is not an erasure mode: use anonymise or delete", raw)
}

type rule int

const (
	keep rule = iota
	clear
	reduceMetadata
	reduceChanges
)

// schema classifies every stored field. A field missing here fails the schema
// test, so a new column cannot hold personal data that erasure skips.
var schema = map[string]map[string]rule{
	"subject": {
		"id": keep, "tenantId": keep, "createdAt": keep, "updatedAt": keep,
		"erasedAt":   keep,
		"externalId": clear, "identityProvider": clear,
	},
	"consent": {
		"id": keep, "tenantId": keep, "createdAt": keep,
		"subject": keep, "domain": keep, "policy": keep, "runtimePolicyDecision": keep,
		"purposes": keep, "givenAt": keep, "validUntil": keep,
		"jurisdiction": keep, "jurisdictionModel": keep, "tcString": keep,
		"uiSource": keep, "consentAction": keep, "runtimePolicySource": keep,
		"submissionKey": keep,
		"ipAddress":     clear, "userAgent": clear, "metadata": reduceMetadata,
	},
	"auditLog": {
		"id": keep, "tenantId": keep, "createdAt": keep,
		"entityType": keep, "entityId": keep, "actionType": keep, "subject": keep,
		"ipAddress": clear, "userAgent": clear, "metadata": clear, "changes": reduceChanges,
	},
	"domain": {
		"id": keep, "tenantId": keep, "createdAt": keep, "updatedAt": keep, "name": keep,
	},
	"consentPurpose": {
		"id": keep, "tenantId": keep, "createdAt": keep, "updatedAt": keep, "code": keep,
	},
	"consentPolicy": {
		"id": keep, "tenantId": keep, "createdAt": keep,
		"version": keep, "type": keep, "hash": keep, "effectiveDate": keep, "isActive": keep,
	},
	"runtimePolicyDecision": {
		"id": keep, "tenantId": keep, "createdAt": keep,
		"policy": keep, "fingerprint": keep, "matchedBy": keep, "countryCode": keep,
		"regionCode": keep, "jurisdiction": keep, "language": keep, "model": keep,
		"policyI18n": keep, "uiMode": keep, "bannerUi": keep, "dialogUi": keep,
		"categories": keep, "preselectedCategories": keep, "proofConfig": keep,
		"dedupeKey": keep, "packId": keep,
	},
	// PocketBase's own auth collection, for operator accounts. The app never
	// stores a visitor in it.
	"users": {
		"id": keep, "password": keep, "tokenKey": keep, "email": keep,
		"emailVisibility": keep, "verified": keep, "name": keep, "avatar": keep,
		"created": keep, "updated": keep,
	},
	"apiKey": {
		"id": keep, "createdAt": keep, "updatedAt": keep,
		"name": keep, "keyHash": keep, "env": keep, "scope": keep, "origins": keep,
		"revoked": keep, "lastUsedAt": keep,
	},
}

var serverMetadata = []string{consent.ClientClaimKey, consent.PolicyLanguageKey}

var identityKeys = map[string]bool{"externalId": true, "identityProvider": true}

// Classified reports whether a field has an erasure rule.
func Classified(collection, field string) bool {
	_, ok := schema[collection][field]
	return ok
}

// PersonalFields lists, sorted, the fields of a collection that erasure
// changes.
func PersonalFields(collection string) []string {
	var fields []string
	for field, r := range schema[collection] {
		if r != keep {
			fields = append(fields, field)
		}
	}
	sort.Strings(fields)
	return fields
}

// Scrub takes a record's personal fields and returns what each becomes. A nil
// value clears the field.
func Scrub(collection string, values map[string]any) map[string]any {
	out := make(map[string]any, len(values))
	for field, value := range values {
		switch schema[collection][field] {
		case clear:
			out[field] = nil
		case reduceMetadata:
			out[field] = keepKeys(value, serverMetadata)
		case reduceChanges:
			out[field] = withoutIdentity(value)
		}
	}
	return out
}

func keepKeys(value any, keys []string) any {
	m, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	out := map[string]any{}
	for _, key := range keys {
		if v, ok := m[key]; ok {
			out[key] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func withoutIdentity(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, child := range v {
			if !identityKeys[key] {
				out[key] = withoutIdentity(child)
			}
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, child := range v {
			out[i] = withoutIdentity(child)
		}
		return out
	}
	return value
}

package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"thom/core/erasure"
)

func file(body string) *fstest.MapFile {
	return &fstest.MapFile{Data: []byte(body)}
}

func TestLoadMessages(t *testing.T) {
	got, err := loadMessages(fstest.MapFS{
		"default/profile.json":   file(`{"fallbackLanguage":"pt-BR"}`),
		"default/pt-BR.json":     file(`{"common":{"acceptAll":"Concordo"}}`),
		"default/en.json":        file(`{}`),
		"default/.DS_Store":      file("x"),
		"lgpd-strict/pt-BR.json": file(`{"cookieBanner":{"title":"Privacidade"}}`),
		"README.md":              file("operators read this"),
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(got.Profiles) != 2 {
		t.Fatalf("profiles = %v, want default and lgpd-strict", got.Profiles)
	}
	main := got.Profiles["default"]
	if main.FallbackLanguage != "pt-BR" {
		t.Errorf("fallbackLanguage = %q, want pt-BR", main.FallbackLanguage)
	}
	if len(main.Translations) != 2 {
		t.Errorf("default languages = %v, want en and pt-BR", main.Translations)
	}
	if common, _ := main.Translations["pt-BR"]["common"].(map[string]any); common["acceptAll"] != "Concordo" {
		t.Errorf("pt-BR = %v, want the file's strings", main.Translations["pt-BR"])
	}
	if _, ok := got.Profiles["lgpd-strict"].Translations["pt-BR"]; !ok {
		t.Error("lgpd-strict has no pt-BR")
	}
}

func TestLoadMessagesRejects(t *testing.T) {
	tests := []struct {
		name    string
		fsys    fstest.MapFS
		wantErr string
	}{
		{name: "invalid json", fsys: fstest.MapFS{"default/en.json": file(`{"common":`)}, wantErr: "default/en.json"},
		{name: "a file that is not json", fsys: fstest.MapFS{"default/en.jsn": file(`{}`)}, wantErr: "default/en.jsn"},
		{name: "a directory inside a profile", fsys: fstest.MapFS{"default/en/x.json": file(`{}`)}, wantErr: "default/en"},
		{name: "a name that is not a language tag", fsys: fstest.MapFS{"default/english.json": file(`{}`)}, wantErr: "english"},
		{name: "an unknown translation key", fsys: fstest.MapFS{"default/en.json": file(`{"common":{"acceptAl":"x"}}`)}, wantErr: "common.acceptAl"},
		{name: "an unknown profile setting", fsys: fstest.MapFS{"default/profile.json": file(`{"fallback":"en"}`)}, wantErr: "default/profile.json"},
		{name: "a fallback that is not a language tag", fsys: fstest.MapFS{"default/profile.json": file(`{"fallbackLanguage":"english"}`)}, wantErr: "english"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := loadMessages(tt.fsys)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("loadMessages = %v, want an error naming %q", err, tt.wantErr)
			}
		})
	}
}

func TestConfigFromEnvReadsTheMessagesDirectory(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "strict"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "strict", "de.json"), []byte(`{"common":{"acceptAll":"Ja"}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := ConfigFromEnv(envFrom(map[string]string{
		"C15T_I18N_DIR":             dir,
		"C15T_I18N_DEFAULT_PROFILE": "strict",
	}))
	if err != nil {
		t.Fatal(err)
	}

	if got.Messages.DefaultProfile != "strict" {
		t.Errorf("DefaultProfile = %q, want strict", got.Messages.DefaultProfile)
	}
	if _, ok := got.Messages.Profiles["strict"].Translations["de"]; !ok {
		t.Errorf("profiles = %v, want strict with de", got.Messages.Profiles)
	}
}

func TestConfigFromEnvRefusesAMissingMessagesDirectory(t *testing.T) {
	_, err := ConfigFromEnv(envFrom(map[string]string{
		"C15T_I18N_DIR": filepath.Join(t.TempDir(), "absent"),
	}))
	if err == nil || !strings.Contains(err.Error(), "C15T_I18N_DIR") {
		t.Fatalf("err = %v, want one naming C15T_I18N_DIR", err)
	}
}

func TestConfigFromEnvReadsTheErasureMode(t *testing.T) {
	got, err := ConfigFromEnv(envFrom(nil))
	if err != nil || got.ErasureMode != erasure.Anonymise {
		t.Fatalf("default = %q, %v; want anonymise", got.ErasureMode, err)
	}

	got, err = ConfigFromEnv(envFrom(map[string]string{"C15T_ERASURE_MODE": "delete"}))
	if err != nil || got.ErasureMode != erasure.Delete {
		t.Fatalf("delete = %q, %v", got.ErasureMode, err)
	}

	if _, err := ConfigFromEnv(envFrom(map[string]string{"C15T_ERASURE_MODE": "purge"})); err == nil || !strings.Contains(err.Error(), "C15T_ERASURE_MODE") {
		t.Fatalf("err = %v, want one naming C15T_ERASURE_MODE", err)
	}
}

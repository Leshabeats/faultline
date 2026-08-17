package config

import (
	"os"
	"testing"
)

func TestProductionRejectsOpenCORS(t *testing.T) {
	t.Setenv("FAULTLINE_ENV", "production")
	t.Setenv("FAULTLINE_CORS_ORIGINS", "*")
	if _, err := Load(); err == nil {
		t.Fatal("production must reject wildcard CORS")
	}
}

func TestDevelopmentAllowsExplicitOrigins(t *testing.T) {
	t.Setenv("FAULTLINE_ENV", "development")
	t.Setenv("FAULTLINE_CORS_ORIGINS", "http://127.0.0.1:4173")
	t.Setenv("FAULTLINE_HTTP_ADDR", "127.0.0.1:8787")
	t.Cleanup(func() { _ = os.Unsetenv("FAULTLINE_PUBLIC_SHARE_BASE") })
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AllowOpenCORS {
		t.Fatal("explicit origin list should not be treated as open CORS")
	}
}

func TestLoadReadsDotEnvWithoutOverridingProcessEnv(t *testing.T) {
	dir := t.TempDir()
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	if err := os.WriteFile(".env", []byte("FAULTLINE_HTTP_ADDR=127.0.0.1:9999\nFAULTLINE_PUBLIC_SHARE_BASE=http://from-file\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("FAULTLINE_HTTP_ADDR", "127.0.0.1:8787")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.HTTPAddr != "127.0.0.1:8787" {
		t.Fatalf("process env should win, got %s", cfg.HTTPAddr)
	}
	if cfg.PublicShareBase != "http://from-file" {
		t.Fatalf("expected dotenv value, got %s", cfg.PublicShareBase)
	}
}

func TestLoadRejectsMalformedNumericEnv(t *testing.T) {
	t.Setenv("FAULTLINE_RATE_LIMIT_PER_MINUTE", "ten")
	if _, err := Load(); err == nil {
		t.Fatal("expected malformed numeric env to fail")
	}
}


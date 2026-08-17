package config

import (
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
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AllowOpenCORS {
		t.Fatal("explicit origin list should not be treated as open CORS")
	}
}

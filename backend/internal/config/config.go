package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env                string
	HTTPAddr           string
	SQLitePath         string
	PublicShareBase    string
	CORSOrigins        []string
	MaxBodyBytes       int64
	RateLimitPerMinute int
	ShutdownTimeout    time.Duration
	AllowOpenCORS      bool
}

func Load() (Config, error) {
	loadDotEnv()
	cfg := Config{
		Env:                getenv("FAULTLINE_ENV", "development"),
		HTTPAddr:           getenv("FAULTLINE_HTTP_ADDR", "127.0.0.1:8787"),
		SQLitePath:         getenv("FAULTLINE_SQLITE_PATH", "./data/faultline.db"),
		PublicShareBase:    strings.TrimRight(getenv("FAULTLINE_PUBLIC_SHARE_BASE", "http://127.0.0.1:4173"), "/"),
		CORSOrigins:        splitCSV(getenv("FAULTLINE_CORS_ORIGINS", "http://127.0.0.1:4173,http://localhost:4173")),
		MaxBodyBytes:       int64(getenvInt("FAULTLINE_MAX_BODY_BYTES", 1_100_000)),
		RateLimitPerMinute: getenvInt("FAULTLINE_RATE_LIMIT_PER_MINUTE", 30),
		ShutdownTimeout:    10 * time.Second,
	}
	if cfg.MaxBodyBytes < 1024 {
		return Config{}, fmt.Errorf("FAULTLINE_MAX_BODY_BYTES must be at least 1024")
	}
	if cfg.RateLimitPerMinute < 1 {
		return Config{}, fmt.Errorf("FAULTLINE_RATE_LIMIT_PER_MINUTE must be at least 1")
	}
	if cfg.Env == "production" {
		for _, origin := range cfg.CORSOrigins {
			if origin == "*" {
				return Config{}, fmt.Errorf("FAULTLINE_CORS_ORIGINS cannot include * in production")
			}
		}
	}
	cfg.AllowOpenCORS = cfg.Env != "production" && contains(cfg.CORSOrigins, "*")
	return cfg, nil
}

func (c Config) IsProduction() bool {
	return c.Env == "production"
}

func getenv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func splitCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func loadDotEnv() {
	for _, path := range []string{".env", filepath.Join("backend", ".env")} {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
				continue
			}
			key, value, _ := strings.Cut(line, "=")
			key = strings.TrimSpace(key)
			value = strings.TrimSpace(value)
			if len(value) >= 2 {
				if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
					value = value[1 : len(value)-1]
				}
			}
			if key == "" {
				continue
			}
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, value)
			}
		}
		_ = file.Close()
	}
}

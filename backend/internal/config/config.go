package config

import (
	"bufio"
	"fmt"
	"net/netip"
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
	TrustedProxyCIDRs  []netip.Prefix
	MaxBodyBytes       int64
	RateLimitPerMinute int
	MaxStoredReplays   int
	MaxStoredBytes     int64
	ReadTimeout        time.Duration
	WriteTimeout       time.Duration
	ShutdownTimeout    time.Duration
	AllowOpenCORS      bool
}

func Load() (Config, error) {
	loadDotEnv()
	maxBodyBytes, err := getenvInt("FAULTLINE_MAX_BODY_BYTES", 1_100_000)
	if err != nil {
		return Config{}, err
	}
	rateLimit, err := getenvInt("FAULTLINE_RATE_LIMIT_PER_MINUTE", 30)
	if err != nil {
		return Config{}, err
	}
	maxStored, err := getenvInt("FAULTLINE_MAX_STORED_REPLAYS", 200)
	if err != nil {
		return Config{}, err
	}
	maxStoredBytes, err := getenvInt("FAULTLINE_MAX_STORED_BYTES", 50_000_000)
	if err != nil {
		return Config{}, err
	}
	trustedProxyCIDRs, err := parseCIDRs(getenv("FAULTLINE_TRUSTED_PROXY_CIDRS", ""))
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		Env:                getenv("FAULTLINE_ENV", "development"),
		HTTPAddr:           getenv("FAULTLINE_HTTP_ADDR", "127.0.0.1:8787"),
		SQLitePath:         getenv("FAULTLINE_SQLITE_PATH", "./data/faultline.db"),
		PublicShareBase:    strings.TrimRight(getenv("FAULTLINE_PUBLIC_SHARE_BASE", "http://127.0.0.1:4173"), "/"),
		CORSOrigins:        splitCSV(getenv("FAULTLINE_CORS_ORIGINS", "http://127.0.0.1:4173,http://localhost:4173")),
		TrustedProxyCIDRs:  trustedProxyCIDRs,
		MaxBodyBytes:       int64(maxBodyBytes),
		RateLimitPerMinute: rateLimit,
		MaxStoredReplays:   maxStored,
		MaxStoredBytes:     int64(maxStoredBytes),
		ReadTimeout:        15 * time.Second,
		WriteTimeout:       20 * time.Second,
		ShutdownTimeout:    10 * time.Second,
	}
	if cfg.MaxBodyBytes < 1024 {
		return Config{}, fmt.Errorf("FAULTLINE_MAX_BODY_BYTES must be at least 1024")
	}
	if cfg.RateLimitPerMinute < 1 {
		return Config{}, fmt.Errorf("FAULTLINE_RATE_LIMIT_PER_MINUTE must be at least 1")
	}
	if cfg.MaxStoredReplays < 1 {
		return Config{}, fmt.Errorf("FAULTLINE_MAX_STORED_REPLAYS must be at least 1")
	}
	if cfg.MaxStoredBytes < cfg.MaxBodyBytes {
		return Config{}, fmt.Errorf("FAULTLINE_MAX_STORED_BYTES must be at least FAULTLINE_MAX_BODY_BYTES")
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

func getenvInt(key string, fallback int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	return value, nil
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

func parseCIDRs(raw string) ([]netip.Prefix, error) {
	values := splitCSV(raw)
	prefixes := make([]netip.Prefix, 0, len(values))
	for _, value := range values {
		prefix, err := netip.ParsePrefix(value)
		if err != nil {
			return nil, fmt.Errorf("FAULTLINE_TRUSTED_PROXY_CIDRS contains invalid CIDR %q", value)
		}
		prefixes = append(prefixes, prefix.Masked())
	}
	return prefixes, nil
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

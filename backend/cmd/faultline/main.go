package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/config"
	"github.com/Leshabeats/faultline/backend/internal/httpapi"
	"github.com/Leshabeats/faultline/backend/internal/migrate"
	"github.com/Leshabeats/faultline/backend/internal/repository"
	"github.com/Leshabeats/faultline/backend/internal/service"
	_ "modernc.org/sqlite"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "event", "config_error", "err", err)
		os.Exit(1)
	}
	if err := os.MkdirAll(filepath.Dir(cfg.SQLitePath), 0o755); err != nil {
		logger.Error("could not create data directory", "event", "data_dir_error", "err", err)
		os.Exit(1)
	}
	db, err := sql.Open("sqlite", cfg.SQLitePath+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)")
	if err != nil {
		logger.Error("could not open sqlite", "event", "sqlite_open_error", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := migrate.Up(db); err != nil {
		logger.Error("migration failed", "event", "migration_error", "err", err)
		os.Exit(1)
	}
	handler := httpapi.New(cfg, service.NewPublicReplayService(repository.NewPublicReplayRepository(db), cfg.PublicShareBase), logger)
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		logger.Info("faultline api listening",
			"event", "api_listen",
			"addr", cfg.HTTPAddr,
			"env", cfg.Env,
		)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("api server failed", "event", "api_listen_error", "err", err)
			os.Exit(1)
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "event", "shutdown_error", "err", err)
		os.Exit(1)
	}
}

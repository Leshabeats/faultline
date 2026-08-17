package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/config"
	"github.com/Leshabeats/faultline/backend/internal/replay"
	"github.com/Leshabeats/faultline/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

type Server struct {
	cfg     config.Config
	service *service.PublicReplayService
	logger  *slog.Logger
	limiter *rateLimiter
}

func New(cfg config.Config, svc *service.PublicReplayService, logger *slog.Logger) http.Handler {
	server := &Server{
		cfg:     cfg,
		service: svc,
		logger:  logger,
		limiter: newRateLimiter(cfg.RateLimitPerMinute, time.Minute),
	}
	router := chi.NewRouter()
	router.Use(server.recoverer)
	router.Use(server.securityHeaders)
	router.Use(server.cors)
	router.Get("/healthz", server.healthz)
	router.Route("/api/public-replays", func(r chi.Router) {
		r.With(server.limitBody, server.rateLimit).Post("/", server.publish)
		r.Get("/{id}", server.get)
		r.Delete("/{id}", server.remove)
	})
	return router
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) publish(w http.ResponseWriter, r *http.Request) {
	raw, err := readLimitedBody(r, s.cfg.MaxBodyBytes)
	if err != nil {
		s.writeError(w, http.StatusRequestEntityTooLarge, "too-large", "Public replay is larger than the safe limit.")
		return
	}
	result, err := s.service.Publish(raw)
	if err != nil {
		s.mapError(w, err)
		return
	}
	s.logger.Info("public replay published",
		"event", "public_replay_published",
		"replayId", result.ID,
		"bytes", len(raw),
	)
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	view, err := s.service.Get(id)
	if err != nil {
		s.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) remove(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	token := r.Header.Get("X-Faultline-Delete-Token")
	if err := s.service.Delete(id, token); err != nil {
		s.mapError(w, err)
		return
	}
	s.logger.Info("public replay deleted",
		"event", "public_replay_deleted",
		"replayId", id,
	)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) mapError(w http.ResponseWriter, err error) {
	var replayErr *replay.Error
	if errors.As(err, &replayErr) {
		status := http.StatusBadRequest
		if replayErr.Code == "too-large" {
			status = http.StatusRequestEntityTooLarge
		}
		if replayErr.Code == "unsupported-version" {
			status = http.StatusUnprocessableEntity
		}
		if replayErr.Code == "private-content" {
			status = http.StatusUnprocessableEntity
		}
		s.writeError(w, status, replayErr.Code, replayErr.Message)
		return
	}
	if service.IsNotFound(err) {
		s.writeError(w, http.StatusNotFound, "not-found", "Public replay was not found.")
		return
	}
	if service.IsForbidden(err) {
		s.writeError(w, http.StatusUnauthorized, "unauthorized", "This replay cannot be deleted with the provided token.")
		return
	}
	if service.IsQuotaExceeded(err) {
		s.writeError(w, http.StatusInsufficientStorage, "storage-quota", "Public replay storage is full. Delete an older replay and try again.")
		return
	}
	s.logger.Error("public replay request failed", "event", "public_replay_error", "err", err)
	s.writeError(w, http.StatusInternalServerError, "unavailable", "The replay service is unavailable.")
}

func (s *Server) writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				s.logger.Error("panic recovered", "event", "http_panic", "err", rec)
				s.writeError(w, http.StatusInternalServerError, "unavailable", "The replay service is unavailable.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := origin != "" && s.allowsOrigin(origin)
		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Faultline-Delete-Token")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			if origin != "" && !allowed {
				s.writeError(w, http.StatusForbidden, "origin-not-allowed", "This origin is not allowed to call the replay service.")
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if origin != "" && !allowed && (r.Method == http.MethodPost || r.Method == http.MethodDelete || r.Method == http.MethodPut || r.Method == http.MethodPatch) {
			s.writeError(w, http.StatusForbidden, "origin-not-allowed", "This origin is not allowed to call the replay service.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) allowsOrigin(origin string) bool {
	if s.cfg.AllowOpenCORS {
		return true
	}
	for _, allowed := range s.cfg.CORSOrigins {
		if allowed == origin {
			return true
		}
	}
	return false
}

func (s *Server) limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxBodyBytes)
		next.ServeHTTP(w, r)
	})
}

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.limiter.allow(clientIP(r)) {
			s.writeError(w, http.StatusTooManyRequests, "rate-limited", "Too many publish requests. Try again shortly.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func readLimitedBody(r *http.Request, max int64) ([]byte, error) {
	defer r.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(r.Body, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > max {
		return nil, errors.New("too large")
	}
	return raw, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

type rateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	requests map[string][]time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		limit:    limit,
		window:   window,
		requests: map[string][]time.Time{},
	}
}

func (l *rateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.evictExpiredLocked(now)
	cutoff := now.Add(-l.window)
	next := make([]time.Time, 0, len(l.requests[key])+1)
	for _, stamp := range l.requests[key] {
		if stamp.After(cutoff) {
			next = append(next, stamp)
		}
	}
	if len(next) >= l.limit {
		if len(next) == 0 {
			delete(l.requests, key)
		} else {
			l.requests[key] = next
		}
		return false
	}
	l.requests[key] = append(next, now)
	return true
}

func (l *rateLimiter) evictExpiredLocked(now time.Time) {
	cutoff := now.Add(-l.window)
	for key, stamps := range l.requests {
		alive := 0
		for _, stamp := range stamps {
			if stamp.After(cutoff) {
				alive++
			}
		}
		if alive == 0 {
			delete(l.requests, key)
		}
	}
}

func (l *rateLimiter) trackedKeys() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.requests)
}

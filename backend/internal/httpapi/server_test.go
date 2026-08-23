package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/config"
	"github.com/Leshabeats/faultline/backend/internal/migrate"
	"github.com/Leshabeats/faultline/backend/internal/repository"
	"github.com/Leshabeats/faultline/backend/internal/service"
	_ "modernc.org/sqlite"
)

func testHandler(t *testing.T) http.Handler {
	t.Helper()
	db, err := sql.Open("sqlite", "file:http-"+t.Name()+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := migrate.Up(db); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		Env:                "test",
		HTTPAddr:           "127.0.0.1:0",
		PublicShareBase:    "http://127.0.0.1:4173",
		CORSOrigins:        []string{"http://127.0.0.1:4173"},
		MaxBodyBytes:       1_100_000,
		RateLimitPerMinute: 30,
		MaxStoredReplays:   200,
		MaxStoredBytes:     50_000_000,
	}
	return New(cfg, service.NewPublicReplayService(repository.NewPublicReplayRepository(db), cfg.PublicShareBase, 200, 50_000_000), slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func validBody() string {
	return `{
  "schema": "faultline.public-replay",
  "version": 1,
  "publishedAt": "2026-08-17T10:00:00.000Z",
  "replay": {
    "schema": "faultline.replay",
    "version": 1,
    "exportedAt": "2026-08-03T10:00:05.000Z",
    "attempt": {
      "id": "attempt-1",
      "challengeId": "url-shortener",
      "startedAt": "2026-08-03T10:00:00.000Z",
      "updatedAt": "2026-08-03T10:00:05.000Z",
      "durationMs": 0,
      "initial": {
        "architecture": {
          "nodes": [
            {"id": "client", "type": "system", "position": {"x": 10, "y": 20}, "data": {"kind": "client", "label": "Clients"}}
          ],
          "edges": []
        },
        "load": 1,
        "fault": "none"
      },
      "events": []
    }
  }
}`
}

func TestHealthz(t *testing.T) {
	res := httptest.NewRecorder()
	testHandler(t).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("status %d", res.Code)
	}
}

func TestPublishGetAndDeleteLifecycle(t *testing.T) {
	handler := testHandler(t)

	publishRec := httptest.NewRecorder()
	publishReq := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(validBody()))
	publishReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(publishRec, publishReq)
	if publishRec.Code != http.StatusCreated {
		t.Fatalf("publish status %d: %s", publishRec.Code, publishRec.Body.String())
	}
	var published struct {
		ID          string `json:"id"`
		URL         string `json:"url"`
		DeleteToken string `json:"deleteToken"`
	}
	if err := json.Unmarshal(publishRec.Body.Bytes(), &published); err != nil {
		t.Fatal(err)
	}
	if published.ID == "" || published.DeleteToken == "" || !strings.Contains(published.URL, "/#/r/") {
		t.Fatalf("unexpected publish response: %#v", published)
	}

	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, httptest.NewRequest(http.MethodGet, "/api/public-replays/"+published.ID, nil))
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status %d", getRec.Code)
	}
	if bytes.Contains(getRec.Body.Bytes(), []byte("deleteToken")) {
		t.Fatal("GET leaked delete token")
	}

	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/public-replays/does-not-exist-id123456", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", missing.Code)
	}

	wrong := httptest.NewRecorder()
	wrongReq := httptest.NewRequest(http.MethodDelete, "/api/public-replays/"+published.ID, nil)
	wrongReq.Header.Set("X-Faultline-Delete-Token", "nope")
	handler.ServeHTTP(wrong, wrongReq)
	if wrong.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", wrong.Code)
	}

	del := httptest.NewRecorder()
	delReq := httptest.NewRequest(http.MethodDelete, "/api/public-replays/"+published.ID, nil)
	delReq.Header.Set("X-Faultline-Delete-Token", published.DeleteToken)
	handler.ServeHTTP(del, delReq)
	if del.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", del.Code)
	}

	after := httptest.NewRecorder()
	handler.ServeHTTP(after, httptest.NewRequest(http.MethodGet, "/api/public-replays/"+published.ID, nil))
	if after.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", after.Code)
	}
}

func TestPublishRejectsPrivateMalformedAndUnsupportedPayloads(t *testing.T) {
	handler := testHandler(t)

	private := strings.ReplaceAll(validBody(), `"events": []`, `"events": [{"id":"a1","atMs":0,"sequence":0,"source":"user","type":"answer.submitted","payload":{"answer":"secret"}}]`)
	privateRec := httptest.NewRecorder()
	privateReq := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(private))
	privateReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(privateRec, privateReq)
	if privateRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for private content, got %d", privateRec.Code)
	}

	badRec := httptest.NewRecorder()
	badReq := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader("{"))
	badReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(badRec, badReq)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for malformed json, got %d", badRec.Code)
	}

	version := strings.Replace(validBody(), `"version": 1,`, `"version": 9,`, 1)
	versionRec := httptest.NewRecorder()
	versionReq := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(version))
	versionReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(versionRec, versionReq)
	if versionRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for unsupported version, got %d", versionRec.Code)
	}
}

func TestProductionCORSDoesNotReflectUnknownOrigins(t *testing.T) {
	handler := testHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unknown origin should not receive CORS allowance")
	}
}

func TestOversizedPublishIsRejected(t *testing.T) {
	handler := testHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(strings.Repeat("a", 1_100_001)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", rec.Code)
	}
}

func TestDeleteIgnoresQueryToken(t *testing.T) {
	handler := testHandler(t)

	publishRec := httptest.NewRecorder()
	publishReq := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(validBody()))
	publishReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(publishRec, publishReq)
	if publishRec.Code != http.StatusCreated {
		t.Fatalf("publish status %d: %s", publishRec.Code, publishRec.Body.String())
	}
	var published struct {
		ID          string `json:"id"`
		DeleteToken string `json:"deleteToken"`
	}
	if err := json.Unmarshal(publishRec.Body.Bytes(), &published); err != nil {
		t.Fatal(err)
	}

	queryOnly := httptest.NewRecorder()
	queryReq := httptest.NewRequest(http.MethodDelete, "/api/public-replays/"+published.ID+"?deleteToken="+published.DeleteToken, nil)
	handler.ServeHTTP(queryOnly, queryReq)
	if queryOnly.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for query token, got %d", queryOnly.Code)
	}

	header := httptest.NewRecorder()
	headerReq := httptest.NewRequest(http.MethodDelete, "/api/public-replays/"+published.ID, nil)
	headerReq.Header.Set("X-Faultline-Delete-Token", published.DeleteToken)
	handler.ServeHTTP(header, headerReq)
	if header.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for header token, got %d", header.Code)
	}
}

func TestRateLimiterEvictsExpiredKeys(t *testing.T) {
	limiter := newRateLimiter(2, 40*time.Millisecond)
	if !limiter.allow("203.0.113.10") {
		t.Fatal("first request should be allowed")
	}
	if limiter.trackedKeys() != 1 {
		t.Fatalf("expected one tracked key, got %d", limiter.trackedKeys())
	}
	time.Sleep(50 * time.Millisecond)
	if !limiter.allow("203.0.113.11") {
		t.Fatal("request from a new address should evict the idle key")
	}
	if limiter.trackedKeys() != 1 {
		t.Fatalf("expected expired key to be evicted, tracked %d", limiter.trackedKeys())
	}
}

func TestClientIPIgnoresForwardingHeadersFromUntrustedPeers(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "198.51.100.8:4321"
	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	if got := clientIP(req, nil); got != "198.51.100.8" {
		t.Fatalf("untrusted peer spoofed client identity: %s", got)
	}
}

func TestClientIPUsesFirstUntrustedAddressBehindTrustedProxyChain(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "127.0.0.1:4321"
	req.Header.Set("X-Forwarded-For", "203.0.113.9, 10.1.2.3")
	trusted := []netip.Prefix{
		netip.MustParsePrefix("127.0.0.1/32"),
		netip.MustParsePrefix("10.0.0.0/8"),
	}
	if got := clientIP(req, trusted); got != "203.0.113.9" {
		t.Fatalf("unexpected forwarded client identity: %s", got)
	}
}

func TestClientIPSkipsMalformedHopsBehindTrustedProxy(t *testing.T) {
	trusted := []netip.Prefix{
		netip.MustParsePrefix("127.0.0.1/32"),
		netip.MustParsePrefix("10.0.0.0/8"),
	}
	tests := []struct {
		name      string
		forwarded string
	}{
		{name: "garbage prepended by client", forwarded: "bogus, 203.0.113.9"},
		{name: "empty hop prepended by client", forwarded: ", 203.0.113.9"},
		{name: "garbage inside trusted chain", forwarded: "203.0.113.9, bogus, 10.1.2.3"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = "127.0.0.1:4321"
			req.Header.Set("X-Forwarded-For", test.forwarded)
			if got := clientIP(req, trusted); got != "203.0.113.9" {
				t.Fatalf("malformed hop hid forwarded client identity: %s", got)
			}
		})
	}
}

func TestRateLimitBucketsAreSeparatedByMethod(t *testing.T) {
	db, err := sql.Open("sqlite", "file:methodlimit-"+t.Name()+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := migrate.Up(db); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		Env:                "test",
		HTTPAddr:           "127.0.0.1:0",
		PublicShareBase:    "http://127.0.0.1:4173",
		CORSOrigins:        []string{"http://127.0.0.1:4173"},
		MaxBodyBytes:       1_100_000,
		RateLimitPerMinute: 1,
		MaxStoredReplays:   200,
		MaxStoredBytes:     50_000_000,
	}
	handler := New(cfg, service.NewPublicReplayService(repository.NewPublicReplayRepository(db), cfg.PublicShareBase, 200, 50_000_000), slog.New(slog.NewTextHandler(io.Discard, nil)))

	get := httptest.NewRecorder()
	handler.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/api/public-replays/missing-id-12345678", nil))
	if get.Code != http.StatusNotFound {
		t.Fatalf("first GET status %d", get.Code)
	}

	post := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(validBody()))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(post, request)
	if post.Code != http.StatusCreated {
		t.Fatalf("POST should have an independent bucket, got %d: %s", post.Code, post.Body.String())
	}
}

func TestStateChangingRequestsFromUnknownOriginsAreRejected(t *testing.T) {
	handler := testHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(validBody()))
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for disallowed origin POST, got %d", rec.Code)
	}
}

func TestPublishRejectsWhenStorageQuotaExceeded(t *testing.T) {
	db, err := sql.Open("sqlite", "file:quota-"+t.Name()+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := migrate.Up(db); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		Env:                "test",
		HTTPAddr:           "127.0.0.1:0",
		PublicShareBase:    "http://127.0.0.1:4173",
		CORSOrigins:        []string{"http://127.0.0.1:4173"},
		MaxBodyBytes:       1_100_000,
		RateLimitPerMinute: 30,
		MaxStoredReplays:   1,
		MaxStoredBytes:     50_000_000,
	}
	handler := New(cfg, service.NewPublicReplayService(repository.NewPublicReplayRepository(db), cfg.PublicShareBase, 1, 50_000_000), slog.New(slog.NewTextHandler(io.Discard, nil)))
	first := httptest.NewRecorder()
	firstReq := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(validBody()))
	firstReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(first, firstReq)
	if first.Code != http.StatusCreated {
		t.Fatalf("first publish status %d: %s", first.Code, first.Body.String())
	}
	second := httptest.NewRecorder()
	secondReq := httptest.NewRequest(http.MethodPost, "/api/public-replays", strings.NewReader(validBody()))
	secondReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(second, secondReq)
	if second.Code != http.StatusInsufficientStorage {
		t.Fatalf("expected 507 for quota, got %d: %s", second.Code, second.Body.String())
	}
}

func TestGetIsRateLimited(t *testing.T) {
	db, err := sql.Open("sqlite", "file:getlimit-"+t.Name()+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := migrate.Up(db); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		Env:                "test",
		HTTPAddr:           "127.0.0.1:0",
		PublicShareBase:    "http://127.0.0.1:4173",
		CORSOrigins:        []string{"http://127.0.0.1:4173"},
		MaxBodyBytes:       1_100_000,
		RateLimitPerMinute: 1,
		MaxStoredReplays:   200,
		MaxStoredBytes:     50_000_000,
	}
	handler := New(cfg, service.NewPublicReplayService(repository.NewPublicReplayRepository(db), cfg.PublicShareBase, 200, 50_000_000), slog.New(slog.NewTextHandler(io.Discard, nil)))
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/public-replays/missing-id-12345678", nil))
	if first.Code != http.StatusNotFound {
		t.Fatalf("first get status %d", first.Code)
	}
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/api/public-replays/missing-id-12345678", nil))
	if second.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 for second GET, got %d", second.Code)
	}
}

package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
	}
	return New(cfg, service.NewPublicReplayService(repository.NewPublicReplayRepository(db), cfg.PublicShareBase), slog.New(slog.NewTextHandler(io.Discard, nil)))
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

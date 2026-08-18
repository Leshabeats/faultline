package repository

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/migrate"
	"github.com/Leshabeats/faultline/backend/internal/replaystore"
	_ "modernc.org/sqlite"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:replay-test-"+t.Name()+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := migrate.Up(db); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestPublicReplayRepositoryInsertGetAndDelete(t *testing.T) {
	repo := NewPublicReplayRepository(testDB(t))
	record := replaystore.Record{
		ID:              "id-1",
		CreatedAt:       time.Date(2026, 8, 17, 10, 0, 0, 0, time.UTC),
		EnvelopeJSON:    []byte(`{"schema":"faultline.public-replay"}`),
		DeleteTokenHash: replaystore.HashDeleteToken("secret-token"),
	}
	if err := repo.InsertGuarded(record, nil); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get("id-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "id-1" || string(got.EnvelopeJSON) != string(record.EnvelopeJSON) {
		t.Fatalf("unexpected record: %#v", got)
	}
	if err := repo.Delete("id-1", replaystore.HashDeleteToken("wrong")); !errors.Is(err, replaystore.ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
	if _, err := repo.Get("id-1"); err != nil {
		t.Fatalf("wrong token should not delete: %v", err)
	}
	if err := repo.Delete("id-1", replaystore.HashDeleteToken("secret-token")); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Get("id-1"); !errors.Is(err, replaystore.ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestInsertGuardedRejectsOverCap(t *testing.T) {
	repo := NewPublicReplayRepository(testDB(t))
	record := replaystore.Record{
		ID:              "id-quota-1",
		CreatedAt:       time.Date(2026, 8, 17, 10, 0, 0, 0, time.UTC),
		EnvelopeJSON:    []byte(`{"schema":"faultline.public-replay"}`),
		DeleteTokenHash: replaystore.HashDeleteToken("secret-token"),
	}
	if err := repo.InsertGuarded(record, nil); err != nil {
		t.Fatal(err)
	}
	second := record
	second.ID = "id-quota-2"
	if err := repo.InsertGuarded(second, func(usage replaystore.Usage) error {
		if usage.Records+1 > 1 {
			return replaystore.ErrStorageQuota
		}
		return nil
	}); !errors.Is(err, replaystore.ErrStorageQuota) {
		t.Fatalf("expected quota error, got %v", err)
	}
	if _, err := repo.Get("id-quota-2"); !errors.Is(err, replaystore.ErrNotFound) {
		t.Fatalf("over-quota insert should not persist, got %v", err)
	}
}

func TestInsertGuardedMeasuresUTF8PayloadsInBytes(t *testing.T) {
	repo := NewPublicReplayRepository(testDB(t))
	record := replaystore.Record{
		ID:              "id-utf8-1",
		CreatedAt:       time.Date(2026, 8, 17, 10, 0, 0, 0, time.UTC),
		EnvelopeJSON:    []byte(`{"label":"Привет"}`),
		DeleteTokenHash: replaystore.HashDeleteToken("secret-token"),
	}
	if err := repo.InsertGuarded(record, nil); err != nil {
		t.Fatal(err)
	}

	second := record
	second.ID = "id-utf8-2"
	if err := repo.InsertGuarded(second, func(usage replaystore.Usage) error {
		if usage.Bytes != int64(len(record.EnvelopeJSON)) {
			t.Fatalf("expected %d UTF-8 bytes, got %d", len(record.EnvelopeJSON), usage.Bytes)
		}
		return replaystore.ErrStorageQuota
	}); !errors.Is(err, replaystore.ErrStorageQuota) {
		t.Fatalf("expected guard sentinel, got %v", err)
	}
}

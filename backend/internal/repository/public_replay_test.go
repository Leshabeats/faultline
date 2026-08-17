package repository

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/migrate"
	_ "modernc.org/sqlite"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:replay-test?mode=memory&cache=shared")
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
	record := PublicReplayRecord{
		ID:              "id-1",
		CreatedAt:       time.Date(2026, 8, 17, 10, 0, 0, 0, time.UTC),
		EnvelopeJSON:    []byte(`{"schema":"faultline.public-replay"}`),
		DeleteTokenHash: HashDeleteToken("secret-token"),
	}
	if err := repo.Insert(record); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get("id-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "id-1" || string(got.EnvelopeJSON) != string(record.EnvelopeJSON) {
		t.Fatalf("unexpected record: %#v", got)
	}
	if err := repo.Delete("id-1", HashDeleteToken("wrong")); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
	if _, err := repo.Get("id-1"); err != nil {
		t.Fatalf("wrong token should not delete: %v", err)
	}
	if err := repo.Delete("id-1", HashDeleteToken("secret-token")); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Get("id-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

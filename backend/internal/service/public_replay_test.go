package service

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/replaystore"
)

type memoryStore struct {
	records map[string]replaystore.Record
}

func newMemoryStore() *memoryStore {
	return &memoryStore{records: map[string]replaystore.Record{}}
}

func (s *memoryStore) InsertGuarded(record replaystore.Record, guard func(replaystore.Usage) error) error {
	usage := replaystore.Usage{Records: len(s.records)}
	for _, item := range s.records {
		usage.Bytes += int64(len(item.EnvelopeJSON))
	}
	if guard != nil {
		if err := guard(usage); err != nil {
			return err
		}
	}
	copied := record
	copied.EnvelopeJSON = append([]byte(nil), record.EnvelopeJSON...)
	s.records[record.ID] = copied
	return nil
}

func (s *memoryStore) Get(id string) (replaystore.Record, error) {
	record, ok := s.records[id]
	if !ok {
		return replaystore.Record{}, replaystore.ErrNotFound
	}
	return record, nil
}

func (s *memoryStore) Delete(id, deleteTokenHash string) error {
	record, ok := s.records[id]
	if !ok {
		return replaystore.ErrNotFound
	}
	if record.DeleteTokenHash != deleteTokenHash {
		return replaystore.ErrForbidden
	}
	delete(s.records, id)
	return nil
}

func validEnvelope() string {
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

func TestPublishGetAndDeleteThroughStorePort(t *testing.T) {
	store := newMemoryStore()
	svc := NewPublicReplayService(store, "http://127.0.0.1:4173", 10, 50_000_000)
	published, err := svc.Publish([]byte(validEnvelope()))
	if err != nil {
		t.Fatal(err)
	}
	if published.ID == "" || published.DeleteToken == "" || !strings.Contains(published.URL, "/#/r/") {
		t.Fatalf("unexpected publish result: %#v", published)
	}
	if published.CreatedAt.IsZero() {
		t.Fatal("expected createdAt")
	}
	view, err := svc.Get(published.ID)
	if err != nil {
		t.Fatal(err)
	}
	var envelope map[string]any
	if err := json.Unmarshal(view.Envelope, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope["schema"] != "faultline.public-replay" {
		t.Fatalf("unexpected envelope: %#v", envelope)
	}
	if err := svc.Delete(published.ID, ""); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden empty token, got %v", err)
	}
	if err := svc.Delete(published.ID, published.DeleteToken); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Get(published.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestPublishRejectsQuotaThroughPolicy(t *testing.T) {
	store := newMemoryStore()
	svc := NewPublicReplayService(store, "http://127.0.0.1:4173", 1, 50_000_000)
	if _, err := svc.Publish([]byte(validEnvelope())); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Publish([]byte(validEnvelope())); !errors.Is(err, ErrStorageQuota) {
		t.Fatalf("expected quota error, got %v", err)
	}
}

func TestPublishCreatedAtUsesUTC(t *testing.T) {
	store := newMemoryStore()
	svc := NewPublicReplayService(store, "http://127.0.0.1:4173", 10, 50_000_000)
	published, err := svc.Publish([]byte(validEnvelope()))
	if err != nil {
		t.Fatal(err)
	}
	if published.CreatedAt.Location() != time.UTC {
		t.Fatalf("expected UTC createdAt, got %v", published.CreatedAt.Location())
	}
}

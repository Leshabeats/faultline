package replay

import (
	"strings"
	"testing"
)

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
      "durationMs": 4000,
      "initial": {
        "architecture": {
          "nodes": [
            {"id": "client", "type": "system", "position": {"x": 10, "y": 20}, "data": {"kind": "client", "label": "Clients"}},
            {"id": "database", "type": "system", "position": {"x": 500, "y": 20}, "data": {"kind": "database", "label": "Primary DB"}}
          ],
          "edges": [
            {"id": "client-database", "type": "traffic", "source": "client", "target": "database"}
          ]
        },
        "load": 1,
        "fault": "none"
      },
      "events": [
        {
          "id": "load-10",
          "atMs": 0,
          "sequence": 0,
          "source": "user",
          "type": "load.changed",
          "payload": {"load": 10}
        },
        {
          "id": "answer-1",
          "atMs": 2000,
          "sequence": 1,
          "source": "user",
          "type": "answer.submitted",
          "payload": {"answer": "[redacted]"}
        }
      ]
    }
  }
}`
}

func TestParseAndValidatePublicAcceptsRedactedEnvelope(t *testing.T) {
	if _, _, err := ParseAndValidatePublic([]byte(validEnvelope())); err != nil {
		t.Fatalf("expected valid envelope, got %v", err)
	}
}

func TestParseAndValidatePublicRejectsPrivateAnswers(t *testing.T) {
	raw := strings.ReplaceAll(validEnvelope(), `"[redacted]"`, `"keep the cache warm"`)
	_, _, err := ParseAndValidatePublic([]byte(raw))
	if err == nil {
		t.Fatal("expected private-content error")
	}
	replayErr, ok := err.(*Error)
	if !ok || replayErr.Code != "private-content" {
		t.Fatalf("expected private-content, got %#v", err)
	}
}

func TestParseAndValidatePublicRejectsUnsupportedVersion(t *testing.T) {
	raw := strings.Replace(validEnvelope(), `"version": 1,`, `"version": 9,`, 1)
	_, _, err := ParseAndValidatePublic([]byte(raw))
	if err == nil {
		t.Fatal("expected unsupported-version error")
	}
	replayErr, ok := err.(*Error)
	if !ok || replayErr.Code != "unsupported-version" {
		t.Fatalf("expected unsupported-version, got %#v", err)
	}
}

func TestParseAndValidatePublicRejectsInvalidJSON(t *testing.T) {
	_, _, err := ParseAndValidatePublic([]byte("{"))
	if err == nil {
		t.Fatal("expected invalid-json")
	}
	replayErr, ok := err.(*Error)
	if !ok || replayErr.Code != "invalid-json" {
		t.Fatalf("expected invalid-json, got %#v", err)
	}
}

func TestParseAndValidatePublicRejectsOversizedPayload(t *testing.T) {
	raw := strings.Repeat("a", MaxSerializedBytes+1)
	_, _, err := ParseAndValidatePublic([]byte(raw))
	if err == nil {
		t.Fatal("expected too-large")
	}
	replayErr, ok := err.(*Error)
	if !ok || replayErr.Code != "too-large" {
		t.Fatalf("expected too-large, got %#v", err)
	}
}

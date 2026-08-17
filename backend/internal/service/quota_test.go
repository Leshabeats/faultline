package service

import (
	"testing"

	"github.com/Leshabeats/faultline/backend/internal/replaystore"
)

func TestExceedsStorageQuota(t *testing.T) {
	usage := replaystore.Usage{Records: 1, Bytes: 100}
	if exceedsStorageQuota(usage, 10, 2, 1000) {
		t.Fatal("expected room for one more record")
	}
	if !exceedsStorageQuota(usage, 10, 1, 1000) {
		t.Fatal("expected record cap to fail closed")
	}
	if !exceedsStorageQuota(usage, 950, 10, 1000) {
		t.Fatal("expected byte cap to fail closed")
	}
}

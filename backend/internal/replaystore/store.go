package replaystore

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"
)

var (
	ErrNotFound     = errors.New("public replay not found")
	ErrConflict     = errors.New("public replay already exists")
	ErrForbidden    = errors.New("delete token does not match")
	ErrStorageQuota = errors.New("public replay storage quota exceeded")
)

type Record struct {
	ID              string
	CreatedAt       time.Time
	EnvelopeJSON    []byte
	DeleteTokenHash string
}

type Usage struct {
	Records int
	Bytes   int64
}

type Store interface {
	InsertGuarded(record Record, guard func(Usage) error) error
	Get(id string) (Record, error)
	Delete(id, deleteTokenHash string) error
}

func HashDeleteToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

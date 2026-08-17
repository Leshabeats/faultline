package repository

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrNotFound  = errors.New("public replay not found")
	ErrConflict  = errors.New("public replay already exists")
	ErrForbidden = errors.New("delete token does not match")
)

type PublicReplayRecord struct {
	ID              string
	CreatedAt       time.Time
	EnvelopeJSON    []byte
	DeleteTokenHash string
}

type PublicReplayRepository struct {
	db *sql.DB
}

func NewPublicReplayRepository(db *sql.DB) *PublicReplayRepository {
	return &PublicReplayRepository{db: db}
}

func HashDeleteToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

type StorageUsage struct {
	Records int
	Bytes   int64
}

func (r *PublicReplayRepository) Usage() (StorageUsage, error) {
	var usage StorageUsage
	err := r.db.QueryRow(`
SELECT COUNT(1), COALESCE(SUM(LENGTH(envelope_json)), 0)
FROM public_replays
`).Scan(&usage.Records, &usage.Bytes)
	return usage, err
}

func (r *PublicReplayRepository) Insert(record PublicReplayRecord) error {
	_, err := r.db.Exec(
		`INSERT INTO public_replays (id, created_at, envelope_json, delete_token_hash) VALUES (?, ?, ?, ?)`,
		record.ID,
		record.CreatedAt.UTC().Format(time.RFC3339Nano),
		string(record.EnvelopeJSON),
		record.DeleteTokenHash,
	)
	if err != nil {
		if strings.Contains(strings.ToUpper(err.Error()), "UNIQUE") {
			return ErrConflict
		}
		return fmt.Errorf("insert public replay: %w", err)
	}
	return nil
}

func (r *PublicReplayRepository) Get(id string) (PublicReplayRecord, error) {
	var record PublicReplayRecord
	var createdAt string
	var envelope string
	err := r.db.QueryRow(
		`SELECT id, created_at, envelope_json, delete_token_hash FROM public_replays WHERE id = ?`,
		id,
	).Scan(&record.ID, &createdAt, &envelope, &record.DeleteTokenHash)
	if errors.Is(err, sql.ErrNoRows) {
		return PublicReplayRecord{}, ErrNotFound
	}
	if err != nil {
		return PublicReplayRecord{}, err
	}
	parsed, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, createdAt)
		if err != nil {
			return PublicReplayRecord{}, err
		}
	}
	record.CreatedAt = parsed
	record.EnvelopeJSON = []byte(envelope)
	return record, nil
}

func (r *PublicReplayRepository) Delete(id, deleteTokenHash string) error {
	result, err := r.db.Exec(
		`DELETE FROM public_replays WHERE id = ? AND delete_token_hash = ?`,
		id,
		deleteTokenHash,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		if _, getErr := r.Get(id); errors.Is(getErr, ErrNotFound) {
			return ErrNotFound
		}
		return ErrForbidden
	}
	return nil
}

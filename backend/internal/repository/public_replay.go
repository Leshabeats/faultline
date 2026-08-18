package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/replaystore"
)

type PublicReplayRepository struct {
	db *sql.DB
}

func NewPublicReplayRepository(db *sql.DB) *PublicReplayRepository {
	return &PublicReplayRepository{db: db}
}

func (r *PublicReplayRepository) InsertGuarded(record replaystore.Record, guard func(replaystore.Usage) error) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`UPDATE public_replay_quota_lock SET id = 1 WHERE id = 1`); err != nil {
		return err
	}
	var usage replaystore.Usage
	if err := tx.QueryRow(`
SELECT COUNT(1), COALESCE(SUM(LENGTH(CAST(envelope_json AS BLOB))), 0)
FROM public_replays
`).Scan(&usage.Records, &usage.Bytes); err != nil {
		return err
	}
	if guard != nil {
		if err := guard(usage); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(
		`INSERT INTO public_replays (id, created_at, envelope_json, delete_token_hash) VALUES (?, ?, ?, ?)`,
		record.ID,
		record.CreatedAt.UTC().Format(time.RFC3339Nano),
		string(record.EnvelopeJSON),
		record.DeleteTokenHash,
	); err != nil {
		if strings.Contains(strings.ToUpper(err.Error()), "UNIQUE") {
			return replaystore.ErrConflict
		}
		return fmt.Errorf("insert public replay: %w", err)
	}
	return tx.Commit()
}

func (r *PublicReplayRepository) Get(id string) (replaystore.Record, error) {
	var record replaystore.Record
	var createdAt string
	var envelope string
	err := r.db.QueryRow(
		`SELECT id, created_at, envelope_json, delete_token_hash FROM public_replays WHERE id = ?`,
		id,
	).Scan(&record.ID, &createdAt, &envelope, &record.DeleteTokenHash)
	if errors.Is(err, sql.ErrNoRows) {
		return replaystore.Record{}, replaystore.ErrNotFound
	}
	if err != nil {
		return replaystore.Record{}, err
	}
	parsed, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, createdAt)
		if err != nil {
			return replaystore.Record{}, err
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
		if _, getErr := r.Get(id); errors.Is(getErr, replaystore.ErrNotFound) {
			return replaystore.ErrNotFound
		}
		return replaystore.ErrForbidden
	}
	return nil
}

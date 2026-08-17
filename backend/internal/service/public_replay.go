package service

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Leshabeats/faultline/backend/internal/replay"
	"github.com/Leshabeats/faultline/backend/internal/replaystore"
)

type PublicReplayService struct {
	store           replaystore.Store
	publicShareBase string
	maxRecords      int
	maxBytes        int64
}

var (
	ErrNotFound     = replaystore.ErrNotFound
	ErrForbidden    = replaystore.ErrForbidden
	ErrStorageQuota = replaystore.ErrStorageQuota
)

type PublishResult struct {
	ID          string
	URL         string
	DeleteToken string
	CreatedAt   time.Time
}

type PublicReplayView struct {
	ID        string
	CreatedAt time.Time
	Envelope  []byte
}

func NewPublicReplayService(store replaystore.Store, publicShareBase string, maxRecords int, maxBytes int64) *PublicReplayService {
	return &PublicReplayService{
		store:           store,
		publicShareBase: strings.TrimRight(publicShareBase, "/"),
		maxRecords:      maxRecords,
		maxBytes:        maxBytes,
	}
}

func (s *PublicReplayService) Publish(raw []byte) (PublishResult, error) {
	envelope, _, err := replay.ParseAndValidatePublic(raw)
	if err != nil {
		return PublishResult{}, err
	}
	canonical, err := json.Marshal(envelope)
	if err != nil {
		return PublishResult{}, err
	}
	id, err := randomToken(18)
	if err != nil {
		return PublishResult{}, err
	}
	deleteToken, err := randomToken(32)
	if err != nil {
		return PublishResult{}, err
	}
	createdAt := time.Now().UTC()
	record := replaystore.Record{
		ID:              id,
		CreatedAt:       createdAt,
		EnvelopeJSON:    canonical,
		DeleteTokenHash: replaystore.HashDeleteToken(deleteToken),
	}
	if err := s.store.InsertGuarded(record, func(usage replaystore.Usage) error {
		if exceedsStorageQuota(usage, int64(len(canonical)), s.maxRecords, s.maxBytes) {
			return ErrStorageQuota
		}
		return nil
	}); err != nil {
		return PublishResult{}, err
	}
	return PublishResult{
		ID:          id,
		URL:         s.PublicURL(id),
		DeleteToken: deleteToken,
		CreatedAt:   createdAt,
	}, nil
}

func (s *PublicReplayService) Get(id string) (PublicReplayView, error) {
	record, err := s.store.Get(id)
	if err != nil {
		return PublicReplayView{}, err
	}
	return PublicReplayView{
		ID:        record.ID,
		CreatedAt: record.CreatedAt.UTC(),
		Envelope:  record.EnvelopeJSON,
	}, nil
}

func (s *PublicReplayService) Delete(id, deleteToken string) error {
	if strings.TrimSpace(deleteToken) == "" {
		return ErrForbidden
	}
	return s.store.Delete(id, replaystore.HashDeleteToken(deleteToken))
}

func (s *PublicReplayService) PublicURL(id string) string {
	return fmt.Sprintf("%s/#/r/%s", s.publicShareBase, id)
}

func randomToken(byteLen int) (string, error) {
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.TrimRight(base64.RawURLEncoding.EncodeToString(buf), "="), nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

func IsForbidden(err error) bool {
	return errors.Is(err, ErrForbidden)
}

func IsQuotaExceeded(err error) bool {
	return errors.Is(err, ErrStorageQuota)
}

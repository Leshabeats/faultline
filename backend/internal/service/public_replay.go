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
	"github.com/Leshabeats/faultline/backend/internal/repository"
)

type PublicReplayService struct {
	repo            *repository.PublicReplayRepository
	publicShareBase string
	maxRecords      int
	maxBytes        int64
}

var ErrStorageQuota = errors.New("public replay storage quota exceeded")

type PublishResult struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	DeleteToken string `json:"deleteToken"`
	CreatedAt   string `json:"createdAt"`
}

type PublicReplayView struct {
	ID        string          `json:"id"`
	CreatedAt string          `json:"createdAt"`
	Envelope  json.RawMessage `json:"envelope"`
}

func NewPublicReplayService(repo *repository.PublicReplayRepository, publicShareBase string, maxRecords int, maxBytes int64) *PublicReplayService {
	return &PublicReplayService{
		repo:            repo,
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
	if err := s.ensureQuota(int64(len(canonical))); err != nil {
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
	record := repository.PublicReplayRecord{
		ID:              id,
		CreatedAt:       createdAt,
		EnvelopeJSON:    canonical,
		DeleteTokenHash: repository.HashDeleteToken(deleteToken),
	}
	if err := s.repo.Insert(record); err != nil {
		return PublishResult{}, err
	}
	return PublishResult{
		ID:          id,
		URL:         s.PublicURL(id),
		DeleteToken: deleteToken,
		CreatedAt:   createdAt.Format(time.RFC3339Nano),
	}, nil
}

func (s *PublicReplayService) Get(id string) (PublicReplayView, error) {
	record, err := s.repo.Get(id)
	if err != nil {
		return PublicReplayView{}, err
	}
	return PublicReplayView{
		ID:        record.ID,
		CreatedAt: record.CreatedAt.UTC().Format(time.RFC3339Nano),
		Envelope:  json.RawMessage(record.EnvelopeJSON),
	}, nil
}

func (s *PublicReplayService) Delete(id, deleteToken string) error {
	if strings.TrimSpace(deleteToken) == "" {
		return repository.ErrForbidden
	}
	return s.repo.Delete(id, repository.HashDeleteToken(deleteToken))
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
	return errors.Is(err, repository.ErrNotFound)
}

func IsForbidden(err error) bool {
	return errors.Is(err, repository.ErrForbidden)
}

func (s *PublicReplayService) ensureQuota(additionalBytes int64) error {
	if s.maxRecords <= 0 && s.maxBytes <= 0 {
		return nil
	}
	usage, err := s.repo.Usage()
	if err != nil {
		return err
	}
	if s.maxRecords > 0 && usage.Records+1 > s.maxRecords {
		return ErrStorageQuota
	}
	if s.maxBytes > 0 && usage.Bytes+additionalBytes > s.maxBytes {
		return ErrStorageQuota
	}
	return nil
}

func IsQuotaExceeded(err error) bool {
	return errors.Is(err, ErrStorageQuota)
}

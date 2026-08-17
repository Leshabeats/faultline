package replay

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	PublicSchema        = "faultline.public-replay"
	PublicSchemaVersion = 1
	ReplaySchema        = "faultline.replay"
	ReplaySchemaVersion = 1
	RedactedAnswer      = "[redacted]"
	MaxSerializedBytes  = 1_100_000
	MaxEvents           = 500
	MaxNodes            = 100
	MaxEdges            = 250
	MaxStringCharacters = 20_000
)

type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

type PublicEnvelope struct {
	Schema      string          `json:"schema"`
	Version     int             `json:"version"`
	PublishedAt string          `json:"publishedAt"`
	Replay      json.RawMessage `json:"replay"`
}

type ReplayEnvelope struct {
	Schema     string        `json:"schema"`
	Version    int           `json:"version"`
	ExportedAt string        `json:"exportedAt"`
	Attempt    ReplayAttempt `json:"attempt"`
}

type ReplayAttempt struct {
	ID          string          `json:"id"`
	ChallengeID string          `json:"challengeId"`
	StartedAt   string          `json:"startedAt"`
	UpdatedAt   string          `json:"updatedAt"`
	DurationMs  int             `json:"durationMs"`
	Initial     ReplayInitial   `json:"initial"`
	Events      []ReplayEvent   `json:"events"`
	Summary     json.RawMessage `json:"summary"`
}

type ReplayInitial struct {
	Architecture ReplayArchitecture `json:"architecture"`
	Load         int                `json:"load"`
	Fault        string             `json:"fault"`
	FaultTarget  json.RawMessage    `json:"faultTarget"`
	Capacity     json.RawMessage    `json:"capacity"`
}

type ReplayArchitecture struct {
	Nodes []ReplayNode `json:"nodes"`
	Edges []ReplayEdge `json:"edges"`
}

type ReplayNode struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Position map[string]any `json:"position"`
	Data     ReplayNodeData `json:"data"`
}

type ReplayNodeData struct {
	Kind     string `json:"kind"`
	Label    string `json:"label"`
	Replicas *int   `json:"replicas"`
	Shards   *int   `json:"shards"`
}

type ReplayEdge struct {
	ID           string  `json:"id"`
	Type         string  `json:"type"`
	Source       string  `json:"source"`
	Target       string  `json:"target"`
	SourceHandle *string `json:"sourceHandle"`
	TargetHandle *string `json:"targetHandle"`
}

type ReplayEvent struct {
	ID       string          `json:"id"`
	AtMs     int             `json:"atMs"`
	Sequence int             `json:"sequence"`
	Source   string          `json:"source"`
	Type     string          `json:"type"`
	Timeline json.RawMessage `json:"timeline"`
	Payload  json.RawMessage `json:"payload"`
}

func ParseAndValidatePublic(raw []byte) (PublicEnvelope, ReplayEnvelope, error) {
	if len(raw) > MaxSerializedBytes {
		return PublicEnvelope{}, ReplayEnvelope{}, &Error{Code: "too-large", Message: "Public replay is larger than the safe limit."}
	}
	var unknown any
	if err := json.Unmarshal(raw, &unknown); err != nil {
		return PublicEnvelope{}, ReplayEnvelope{}, &Error{Code: "invalid-json", Message: "Public replay is not valid JSON."}
	}
	object, ok := unknown.(map[string]any)
	if !ok {
		return PublicEnvelope{}, ReplayEnvelope{}, invalidReplay()
	}
	if schema, _ := object["schema"].(string); schema == PublicSchema {
		if version, ok := asInt(object["version"]); ok && version != PublicSchemaVersion {
			return PublicEnvelope{}, ReplayEnvelope{}, &Error{
				Code:    "unsupported-version",
				Message: fmt.Sprintf("Public replay version %v is not supported.", object["version"]),
			}
		}
	}
	var envelope PublicEnvelope
	if err := decodeExact(raw, &envelope); err != nil {
		return PublicEnvelope{}, ReplayEnvelope{}, invalidReplay()
	}
	if envelope.Schema != PublicSchema {
		return PublicEnvelope{}, ReplayEnvelope{}, invalidReplay()
	}
	if envelope.Version != PublicSchemaVersion {
		return PublicEnvelope{}, ReplayEnvelope{}, &Error{
			Code:    "unsupported-version",
			Message: fmt.Sprintf("Public replay version %d is not supported.", envelope.Version),
		}
	}
	if !isISODate(envelope.PublishedAt) {
		return PublicEnvelope{}, ReplayEnvelope{}, invalidReplay()
	}
	inner, err := ParseAndValidateReplay(envelope.Replay)
	if err != nil {
		return PublicEnvelope{}, ReplayEnvelope{}, err
	}
	if hasPrivateInterviewContent(inner.Attempt) {
		return PublicEnvelope{}, ReplayEnvelope{}, &Error{
			Code:    "private-content",
			Message: "Public replay still contains interviewer answers.",
		}
	}
	return envelope, inner, nil
}

func ParseAndValidateReplay(raw []byte) (ReplayEnvelope, error) {
	if len(raw) > MaxSerializedBytes {
		return ReplayEnvelope{}, &Error{Code: "too-large", Message: "Public replay is larger than the safe limit."}
	}
	var unknown any
	if err := json.Unmarshal(raw, &unknown); err != nil {
		return ReplayEnvelope{}, invalidReplay()
	}
	object, ok := unknown.(map[string]any)
	if !ok {
		return ReplayEnvelope{}, invalidReplay()
	}
	if schema, _ := object["schema"].(string); schema == ReplaySchema {
		if version, ok := asInt(object["version"]); ok && version != ReplaySchemaVersion {
			return ReplayEnvelope{}, &Error{
				Code:    "unsupported-version",
				Message: fmt.Sprintf("Replay version %v is not supported.", object["version"]),
			}
		}
	}
	var envelope ReplayEnvelope
	if err := decodeExact(raw, &envelope); err != nil {
		return ReplayEnvelope{}, invalidReplay()
	}
	if envelope.Schema != ReplaySchema || envelope.Version != ReplaySchemaVersion || !isISODate(envelope.ExportedAt) {
		return ReplayEnvelope{}, invalidReplay()
	}
	if err := validateAttempt(envelope.Attempt); err != nil {
		return ReplayEnvelope{}, err
	}
	return envelope, nil
}

func validateAttempt(attempt ReplayAttempt) error {
	if !bounded(attempt.ID) || !bounded(attempt.ChallengeID) || !isISODate(attempt.StartedAt) || !isISODate(attempt.UpdatedAt) {
		return invalidReplay()
	}
	if attempt.DurationMs < 0 {
		return invalidReplay()
	}
	if err := validateArchitecture(attempt.Initial.Architecture); err != nil {
		return err
	}
	if !contains([]int{1, 3, 10}, attempt.Initial.Load) || !isFault(attempt.Initial.Fault) {
		return invalidReplay()
	}
	if len(attempt.Events) > MaxEvents {
		return invalidReplay()
	}
	ids := map[string]struct{}{}
	sequences := map[int]struct{}{}
	minAt := -1
	for _, event := range attempt.Events {
		if !bounded(event.ID) || event.AtMs < 0 || event.Sequence < 0 || event.AtMs > attempt.DurationMs {
			return invalidReplay()
		}
		if _, exists := ids[event.ID]; exists {
			return invalidReplay()
		}
		if _, exists := sequences[event.Sequence]; exists {
			return invalidReplay()
		}
		ids[event.ID] = struct{}{}
		sequences[event.Sequence] = struct{}{}
		if minAt == -1 || event.AtMs < minAt {
			minAt = event.AtMs
		}
		if err := validateEvent(event); err != nil {
			return err
		}
	}
	if len(attempt.Events) > 0 && minAt != 0 {
		return invalidReplay()
	}
	return nil
}

func validateArchitecture(architecture ReplayArchitecture) error {
	if len(architecture.Nodes) > MaxNodes || len(architecture.Edges) > MaxEdges {
		return invalidReplay()
	}
	nodeIDs := map[string]struct{}{}
	for _, node := range architecture.Nodes {
		if !bounded(node.ID) || node.Type != "system" || !bounded(node.Data.Kind) || !bounded(node.Data.Label) {
			return invalidReplay()
		}
		if _, exists := nodeIDs[node.ID]; exists {
			return invalidReplay()
		}
		nodeIDs[node.ID] = struct{}{}
	}
	edgeIDs := map[string]struct{}{}
	for _, edge := range architecture.Edges {
		if !bounded(edge.ID) || edge.Type != "traffic" || !bounded(edge.Source) || !bounded(edge.Target) {
			return invalidReplay()
		}
		if _, ok := nodeIDs[edge.Source]; !ok {
			return invalidReplay()
		}
		if _, ok := nodeIDs[edge.Target]; !ok {
			return invalidReplay()
		}
		if _, exists := edgeIDs[edge.ID]; exists {
			return invalidReplay()
		}
		edgeIDs[edge.ID] = struct{}{}
	}
	return nil
}

func validateEvent(event ReplayEvent) error {
	if !containsString([]string{"user", "system", "interviewer"}, event.Source) {
		return invalidReplay()
	}
	switch event.Type {
	case "answer.submitted":
		var payload struct {
			Answer   string  `json:"answer"`
			Prompt   *string `json:"prompt"`
			Feedback *string `json:"feedback"`
			Focus    *string `json:"focus"`
		}
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return invalidReplay()
		}
		if !boundedAllowEmpty(payload.Answer) {
			return invalidReplay()
		}
		if payload.Answer != RedactedAnswer {
			return &Error{Code: "private-content", Message: "Public replay still contains interviewer answers."}
		}
		if payload.Prompt != nil || payload.Feedback != nil {
			return &Error{Code: "private-content", Message: "Public replay still contains interviewer answers."}
		}
	case "load.changed", "fault.changed", "capacity.changed", "node.added", "node.updated", "node.removed",
		"edge.added", "edge.updated", "edge.removed", "architecture.replaced", "design.submitted":
		if len(event.Payload) == 0 {
			return invalidReplay()
		}
	default:
		return invalidReplay()
	}
	return nil
}

func hasPrivateInterviewContent(attempt ReplayAttempt) bool {
	for _, event := range attempt.Events {
		if event.Type != "answer.submitted" {
			continue
		}
		var payload struct {
			Answer   string  `json:"answer"`
			Prompt   *string `json:"prompt"`
			Feedback *string `json:"feedback"`
		}
		if json.Unmarshal(event.Payload, &payload) != nil {
			return true
		}
		if payload.Answer != RedactedAnswer || payload.Prompt != nil || payload.Feedback != nil {
			return true
		}
	}
	return false
}

func decodeExact(raw []byte, dest any) error {
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		// Extra fields are allowed on inner replay objects; retry loosely.
		return json.Unmarshal(raw, dest)
	}
	return nil
}

func bounded(value string) bool {
	return value != "" && len(value) <= MaxStringCharacters
}

func boundedAllowEmpty(value string) bool {
	return len(value) <= MaxStringCharacters
}

func isISODate(value string) bool {
	if !bounded(value) {
		return false
	}
	if _, err := time.Parse(time.RFC3339, value); err == nil {
		return true
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}

func isFault(value string) bool {
	return containsString([]string{
		"none", "cache-outage", "slow-database", "network-partition", "retry-storm",
		"celebrity-spike", "worker-outage", "hot-key", "duplicate-delivery", "component-outage",
	}, value)
}

func asInt(value any) (int, bool) {
	switch typed := value.(type) {
	case float64:
		return int(typed), typed == float64(int(typed))
	case int:
		return typed, true
	default:
		return 0, false
	}
}

func contains[T comparable](values []T, wanted T) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func containsString(values []string, wanted string) bool {
	return contains(values, wanted)
}

func invalidReplay() *Error {
	return &Error{Code: "invalid-replay", Message: "JSON does not contain a valid Faultline replay."}
}

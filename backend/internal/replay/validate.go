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
	if err := validateOptionalInitial(attempt.Initial); err != nil {
		return err
	}
	if err := validateSummary(attempt.Summary, attempt.DurationMs); err != nil {
		return err
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


func validateOptionalInitial(initial ReplayInitial) error {
	if len(initial.Capacity) > 0 && !isJSONNull(initial.Capacity) {
		object, err := decodeObject(initial.Capacity)
		if err != nil || !isCapacityTuning(object) {
			return invalidReplay()
		}
	} else if isJSONNull(initial.Capacity) {
		return invalidReplay()
	}
	if len(initial.FaultTarget) == 0 || isJSONNull(initial.FaultTarget) {
		if isJSONNull(initial.FaultTarget) {
			return invalidReplay()
		}
		if initial.Fault == "component-outage" {
			return invalidReplay()
		}
		return nil
	}
	object, err := decodeObject(initial.FaultTarget)
	if err != nil || !hasOnlyKeys(object, "type", "id") {
		return invalidReplay()
	}
	kind, _ := object["type"].(string)
	id, _ := object["id"].(string)
	if !bounded(id) || (kind != "node" && kind != "edge") {
		return invalidReplay()
	}
	if initial.Fault == "none" {
		return invalidReplay()
	}
	if kind == "node" && initial.Fault != "component-outage" {
		return invalidReplay()
	}
	if kind == "edge" && initial.Fault != "network-partition" {
		return invalidReplay()
	}
	if initial.Fault == "component-outage" && kind != "node" {
		return invalidReplay()
	}
	exists := false
	if kind == "node" {
		for _, node := range initial.Architecture.Nodes {
			if node.ID == id {
				exists = true
				break
			}
		}
	} else {
		for _, edge := range initial.Architecture.Edges {
			if edge.ID == id {
				exists = true
				break
			}
		}
	}
	if !exists {
		return invalidReplay()
	}
	return nil
}

func validateSummary(raw json.RawMessage, durationMs int) error {
	if len(raw) == 0 {
		return nil
	}
	if isJSONNull(raw) {
		return invalidReplay()
	}
	object, err := decodeObject(raw)
	if err != nil || !hasOnlyKeys(object, "score", "maxScore", "passed", "keyMoment") {
		return invalidReplay()
	}
	score, scoreOK := asInt(object["score"])
	maxScore, maxOK := asInt(object["maxScore"])
	passed, passedOK := object["passed"].(bool)
	if !scoreOK || !maxOK || !passedOK || score < 0 || maxScore < 0 || score > maxScore {
		return invalidReplay()
	}
	_ = passed
	if _, exists := object["keyMoment"]; !exists {
		return nil
	}
	moment, ok := object["keyMoment"].(map[string]any)
	if !ok || !hasOnlyKeys(moment, "atMs", "eventId", "title", "detail", "tone") {
		return invalidReplay()
	}
	atMs, atOK := asInt(moment["atMs"])
	title, titleOK := moment["title"].(string)
	detail, detailOK := moment["detail"].(string)
	tone, toneOK := moment["tone"].(string)
	if !atOK || atMs < 0 || atMs > durationMs || !titleOK || !bounded(title) || !detailOK || !boundedAllowEmpty(detail) {
		return invalidReplay()
	}
	if !toneOK || !containsString([]string{"neutral", "healthy", "warning", "critical"}, tone) {
		return invalidReplay()
	}
	if eventID, exists := moment["eventId"]; exists && !isBoundedValue(eventID) {
		return invalidReplay()
	}
	return nil
}

func isJSONNull(raw json.RawMessage) bool {
	return strings.TrimSpace(string(raw)) == "null"
}

func validateArchitecture(architecture ReplayArchitecture) error {
	if len(architecture.Nodes) > MaxNodes || len(architecture.Edges) > MaxEdges {
		return invalidReplay()
	}
	nodeIDs := map[string]struct{}{}
	for _, node := range architecture.Nodes {
		if !isStoredNode(node) {
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
	if event.Timeline != nil {
		if event.Type == "answer.submitted" {
			return privateContent()
		}
		if err := validateTimeline(event.Timeline); err != nil {
			return err
		}
	}
	object, err := decodeObject(event.Payload)
	if err != nil {
		return invalidReplay()
	}
	switch event.Type {
	case "load.changed":
		if !hasOnlyKeys(object, "load") || !isLoad(object["load"]) {
			return invalidReplay()
		}
	case "fault.changed":
		if err := validateFaultPayload(object); err != nil {
			return err
		}
	case "capacity.changed":
		if err := validateCapacityPayload(object); err != nil {
			return err
		}
	case "node.added":
		if !hasOnlyKeys(object, "node") || !isNode(object["node"]) {
			return invalidReplay()
		}
	case "node.updated":
		if err := validateNodeUpdated(object); err != nil {
			return err
		}
	case "node.removed":
		if !hasOnlyKeys(object, "nodeId") || !isBoundedValue(object["nodeId"]) {
			return invalidReplay()
		}
	case "edge.added":
		if !hasOnlyKeys(object, "edge") || !isEdge(object["edge"]) {
			return invalidReplay()
		}
	case "edge.updated":
		if err := validateEdgeUpdated(object); err != nil {
			return err
		}
	case "edge.removed":
		if !hasOnlyKeys(object, "edgeId") || !isBoundedValue(object["edgeId"]) {
			return invalidReplay()
		}
	case "architecture.replaced":
		if !hasOnlyKeys(object, "architecture") {
			return invalidReplay()
		}
		architecture, err := decodeArchitecture(object["architecture"])
		if err != nil {
			return invalidReplay()
		}
		if err := validateArchitecture(architecture); err != nil {
			return err
		}
	case "answer.submitted":
		if err := validateAnswerPayload(object); err != nil {
			return err
		}
	case "design.submitted":
		if !hasOnlyKeys(object, "submission") || !isSubmission(object["submission"]) {
			return invalidReplay()
		}
	default:
		return invalidReplay()
	}
	return nil
}

func validateAnswerPayload(object map[string]any) error {
	if !hasOnlyKeys(object, "answer", "prompt", "feedback", "focus") {
		return invalidReplay()
	}
	answer, ok := object["answer"].(string)
	if !ok || !boundedAllowEmpty(answer) {
		return invalidReplay()
	}
	if answer != RedactedAnswer {
		return privateContent()
	}
	if _, exists := object["prompt"]; exists {
		return privateContent()
	}
	if _, exists := object["feedback"]; exists {
		return privateContent()
	}
	if _, exists := object["focus"]; exists {
		return privateContent()
	}
	return nil
}

func hasPrivateInterviewContent(attempt ReplayAttempt) bool {
	for _, event := range attempt.Events {
		if event.Type != "answer.submitted" {
			continue
		}
		if event.Timeline != nil {
			return true
		}
		object, err := decodeObject(event.Payload)
		if err != nil {
			return true
		}
		if validateAnswerPayload(object) != nil {
			return true
		}
	}
	return false
}

func validateTimeline(raw json.RawMessage) error {
	object, err := decodeObject(raw)
	if err != nil || !hasOnlyKeys(object, "title", "detail", "tone") {
		return invalidReplay()
	}
	title, titleOK := object["title"].(string)
	detail, detailOK := object["detail"].(string)
	tone, toneOK := object["tone"].(string)
	if !titleOK || !bounded(title) || !detailOK || !boundedAllowEmpty(detail) {
		return invalidReplay()
	}
	if !toneOK || !containsString([]string{"neutral", "healthy", "warning", "critical"}, tone) {
		return invalidReplay()
	}
	return nil
}

func validateFaultPayload(object map[string]any) error {
	if !hasOnlyKeys(object, "fault", "targetNodeId", "targetEdgeId") {
		return invalidReplay()
	}
	fault, ok := object["fault"].(string)
	if !ok || !isFault(fault) {
		return invalidReplay()
	}
	nodeID, hasNode := object["targetNodeId"]
	edgeID, hasEdge := object["targetEdgeId"]
	if hasNode && hasEdge {
		return invalidReplay()
	}
	if hasNode && !isBoundedValue(nodeID) {
		return invalidReplay()
	}
	if hasEdge && !isBoundedValue(edgeID) {
		return invalidReplay()
	}
	if fault == "component-outage" && !hasNode {
		return invalidReplay()
	}
	if hasNode && fault != "component-outage" {
		return invalidReplay()
	}
	if hasEdge && fault != "network-partition" {
		return invalidReplay()
	}
	return nil
}

func validateCapacityPayload(object map[string]any) error {
	if !hasOnlyKeys(object, "capacity", "topology") || !isCapacityTuning(object["capacity"]) {
		return invalidReplay()
	}
	if _, exists := object["topology"]; !exists {
		return nil
	}
	raw, ok := object["topology"].([]any)
	if !ok || len(raw) > MaxNodes {
		return invalidReplay()
	}
	seen := map[string]struct{}{}
	for _, item := range raw {
		patch, ok := item.(map[string]any)
		if !ok || !hasOnlyKeys(patch, "nodeId", "replicas", "shards") {
			return invalidReplay()
		}
		nodeID, ok := patch["nodeId"].(string)
		if !ok || !bounded(nodeID) {
			return invalidReplay()
		}
		replicas, ok := asInt(patch["replicas"])
		if !ok || replicas < 1 || replicas > 16 {
			return invalidReplay()
		}
		shards, ok := asInt(patch["shards"])
		if !ok || shards < 1 || shards > 64 {
			return invalidReplay()
		}
		if _, exists := seen[nodeID]; exists {
			return invalidReplay()
		}
		seen[nodeID] = struct{}{}
	}
	return nil
}

func validateNodeUpdated(object map[string]any) error {
	if !hasOnlyKeys(object, "nodeId", "patch") || !isBoundedValue(object["nodeId"]) {
		return invalidReplay()
	}
	patch, ok := object["patch"].(map[string]any)
	if !ok || !hasOnlyKeys(patch, "position", "data") {
		return invalidReplay()
	}
	if position, exists := patch["position"]; exists && !isPosition(position) {
		return invalidReplay()
	}
	if data, exists := patch["data"]; exists && !isPartialNodeData(data) {
		return invalidReplay()
	}
	return nil
}

func validateEdgeUpdated(object map[string]any) error {
	if !hasOnlyKeys(object, "edgeId", "patch") || !isBoundedValue(object["edgeId"]) {
		return invalidReplay()
	}
	patch, ok := object["patch"].(map[string]any)
	if !ok || !hasOnlyKeys(patch, "source", "target", "sourceHandle", "targetHandle") {
		return invalidReplay()
	}
	if source, exists := patch["source"]; exists && !isBoundedValue(source) {
		return invalidReplay()
	}
	if target, exists := patch["target"]; exists && !isBoundedValue(target) {
		return invalidReplay()
	}
	if !isHandle(patch["sourceHandle"]) || !isHandle(patch["targetHandle"]) {
		return invalidReplay()
	}
	return nil
}

func decodeArchitecture(value any) (ReplayArchitecture, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return ReplayArchitecture{}, err
	}
	var architecture ReplayArchitecture
	if err := json.Unmarshal(raw, &architecture); err != nil {
		return ReplayArchitecture{}, err
	}
	return architecture, nil
}

func decodeObject(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return nil, invalidReplay()
	}
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		return nil, invalidReplay()
	}
	return object, nil
}

func hasOnlyKeys(object map[string]any, allowed ...string) bool {
	allowedSet := map[string]struct{}{}
	for _, key := range allowed {
		allowedSet[key] = struct{}{}
	}
	for key := range object {
		if _, ok := allowedSet[key]; !ok {
			return false
		}
	}
	return true
}

func isLoad(value any) bool {
	load, ok := asInt(value)
	return ok && contains([]int{1, 3, 10}, load)
}


func isStoredNode(node ReplayNode) bool {
	if !bounded(node.ID) || node.Type != "system" || !isPosition(node.Position) || !isComponentKind(node.Data.Kind) || !bounded(node.Data.Label) {
		return false
	}
	if node.Data.Replicas != nil && (*node.Data.Replicas < 1 || *node.Data.Replicas > 16) {
		return false
	}
	if node.Data.Shards != nil && (*node.Data.Shards < 1 || *node.Data.Shards > 64) {
		return false
	}
	return true
}

func isNode(value any) bool {
	node, ok := value.(map[string]any)
	if !ok || !hasOnlyKeys(node, "id", "type", "position", "data") {
		return false
	}
	id, _ := node["id"].(string)
	kind, _ := node["type"].(string)
	return bounded(id) && kind == "system" && isPosition(node["position"]) && isNodeData(node["data"])
}

func isNodeData(value any) bool {
	data, ok := value.(map[string]any)
	if !ok || !hasOnlyKeys(data, "kind", "label", "replicas", "shards") {
		return false
	}
	kind, _ := data["kind"].(string)
	label, _ := data["label"].(string)
	if !isComponentKind(kind) || !bounded(label) {
		return false
	}
	if replicas, exists := data["replicas"]; exists && !isReplicaCount(replicas) {
		return false
	}
	if shards, exists := data["shards"]; exists && !isShardCount(shards) {
		return false
	}
	return true
}

func isPartialNodeData(value any) bool {
	data, ok := value.(map[string]any)
	if !ok || !hasOnlyKeys(data, "kind", "label", "replicas", "shards") {
		return false
	}
	if kind, exists := data["kind"]; exists {
		asString, ok := kind.(string)
		if !ok || !isComponentKind(asString) {
			return false
		}
	}
	if label, exists := data["label"]; exists && !isBoundedValue(label) {
		return false
	}
	if replicas, exists := data["replicas"]; exists && !isReplicaCount(replicas) {
		return false
	}
	if shards, exists := data["shards"]; exists && !isShardCount(shards) {
		return false
	}
	return true
}

func isEdge(value any) bool {
	edge, ok := value.(map[string]any)
	if !ok || !hasOnlyKeys(edge, "id", "type", "source", "target", "sourceHandle", "targetHandle") {
		return false
	}
	id, _ := edge["id"].(string)
	kind, _ := edge["type"].(string)
	source, _ := edge["source"].(string)
	target, _ := edge["target"].(string)
	return bounded(id) && kind == "traffic" && bounded(source) && bounded(target) && isHandle(edge["sourceHandle"]) && isHandle(edge["targetHandle"])
}

func isPosition(value any) bool {
	position, ok := value.(map[string]any)
	if !ok || !hasOnlyKeys(position, "x", "y") {
		return false
	}
	_, xOK := asNumber(position["x"])
	_, yOK := asNumber(position["y"])
	return xOK && yOK
}

func isHandle(value any) bool {
	if value == nil {
		return true
	}
	text, ok := value.(string)
	return ok && boundedAllowEmpty(text)
}

func isCapacityTuning(value any) bool {
	tuning, ok := value.(map[string]any)
	if !ok || !hasOnlyKeys(tuning,
		"cacheHitRate", "indexedLookup", "poolSize", "readReplicas", "databaseProfile",
		"pricingPackId", "benchmarkPackId", "fanoutStrategy", "fanoutWorkers", "fanoutBatchSize",
		"celebrityThreshold", "deduplication",
	) {
		return false
	}
	hitRate, ok := asNumber(tuning["cacheHitRate"])
	if !ok || !containsFloat([]float64{0.9, 0.95, 0.99}, hitRate) {
		return false
	}
	indexed, ok := tuning["indexedLookup"].(bool)
	if !ok {
		return false
	}
	_ = indexed
	poolSize, ok := asInt(tuning["poolSize"])
	if !ok || !contains([]int{100, 300, 600}, poolSize) {
		return false
	}
	replicas, ok := asInt(tuning["readReplicas"])
	if !ok || !contains([]int{0, 1, 2}, replicas) {
		return false
	}
	profile, ok := tuning["databaseProfile"].(string)
	if !ok || !containsString([]string{"compact", "balanced", "performance"}, profile) {
		return false
	}
	if pack, exists := tuning["pricingPackId"]; exists && !containsString([]string{"reference-2026.08", "aws-us-east-1-2026.07"}, asString(pack)) {
		return false
	}
	if pack, exists := tuning["benchmarkPackId"]; exists && !containsString([]string{"reference-2026.08", "local-m1-pro-2026.08"}, asString(pack)) {
		return false
	}
	if strategy, exists := tuning["fanoutStrategy"]; exists && !containsString([]string{"write", "read", "hybrid"}, asString(strategy)) {
		return false
	}
	if workers, exists := tuning["fanoutWorkers"]; exists {
		value, ok := asInt(workers)
		if !ok || !contains([]int{4, 16, 64}, value) {
			return false
		}
	}
	if batch, exists := tuning["fanoutBatchSize"]; exists {
		value, ok := asInt(batch)
		if !ok || !contains([]int{100, 500, 2000}, value) {
			return false
		}
	}
	if threshold, exists := tuning["celebrityThreshold"]; exists {
		value, ok := asInt(threshold)
		if !ok || !contains([]int{100000, 1000000, 10000000}, value) {
			return false
		}
	}
	if dedup, exists := tuning["deduplication"]; exists {
		if _, ok := dedup.(bool); !ok {
			return false
		}
	}
	return true
}

func isSubmission(value any) bool {
	submission, ok := value.(map[string]any)
	if !ok || !hasOnlyKeys(submission, "judgeVersion", "score", "maxScore", "passed", "passedCases", "totalCases") {
		return false
	}
	version, ok := submission["judgeVersion"].(string)
	if !ok || !bounded(version) {
		return false
	}
	score, ok := asInt(submission["score"])
	maxScore, maxOK := asInt(submission["maxScore"])
	passed, passedOK := submission["passed"].(bool)
	passedCases, casesOK := asInt(submission["passedCases"])
	totalCases, totalOK := asInt(submission["totalCases"])
	_ = passed
	return ok && maxOK && passedOK && casesOK && totalOK &&
		score >= 0 && maxScore >= 0 && score <= maxScore &&
		passedCases >= 0 && totalCases >= 0 && passedCases <= totalCases
}

func isComponentKind(value string) bool {
	return containsString([]string{"client", "gateway", "service", "cache", "queue", "database", "region"}, value)
}

func isReplicaCount(value any) bool {
	count, ok := asInt(value)
	return ok && count >= 1 && count <= 16
}

func isShardCount(value any) bool {
	count, ok := asInt(value)
	return ok && count >= 1 && count <= 64
}

func isBoundedValue(value any) bool {
	text, ok := value.(string)
	return ok && bounded(text)
}

func asString(value any) string {
	text, _ := value.(string)
	return text
}

func asNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case int:
		return float64(typed), true
	default:
		return 0, false
	}
}

func containsFloat(values []float64, wanted float64) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func privateContent() *Error {
	return &Error{Code: "private-content", Message: "Public replay still contains interviewer answers."}
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

package replay

import (
	"encoding/json"
	"sort"
)

func capacityReadReplicas(raw json.RawMessage) (int, error) {
	if len(raw) == 0 {
		return 0, nil
	}
	object, err := decodeObject(raw)
	if err != nil {
		return 0, err
	}
	readReplicas, ok := asInt(object["readReplicas"])
	if !ok {
		return 0, invalidReplay()
	}
	return readReplicas, nil
}

func databaseReplicationMatches(nodes []ReplayNode, readReplicas int) bool {
	expected := readReplicas + 1
	for _, node := range nodes {
		if node.Data.Kind != "database" {
			continue
		}
		replicas := 1
		if node.Data.Replicas != nil {
			replicas = *node.Data.Replicas
		}
		if replicas > 3 {
			replicas = 3
		}
		if replicas != expected {
			return false
		}
	}
	return true
}

func validateReplaySequence(initial ReplayArchitecture, sourceEvents []ReplayEvent) error {
	architecture := cloneArchitecture(initial)
	events := append([]ReplayEvent(nil), sourceEvents...)
	sort.Slice(events, func(left, right int) bool {
		if events[left].AtMs != events[right].AtMs {
			return events[left].AtMs < events[right].AtMs
		}
		if events[left].Sequence != events[right].Sequence {
			return events[left].Sequence < events[right].Sequence
		}
		return events[left].ID < events[right].ID
	})

	for _, event := range events {
		payload, err := decodeObject(event.Payload)
		if err != nil {
			return invalidReplay()
		}
		if event.Type == "fault.changed" && !faultTargetExists(payload, architecture) {
			return invalidReplay()
		}
		architecture, err = applyTopologyEvent(architecture, event.Type, payload)
		if err != nil {
			return invalidReplay()
		}
	}
	return nil
}

func faultTargetExists(payload map[string]any, architecture ReplayArchitecture) bool {
	if nodeID, exists := payload["targetNodeId"].(string); exists {
		for _, node := range architecture.Nodes {
			if node.ID == nodeID {
				return true
			}
		}
		return false
	}
	if edgeID, exists := payload["targetEdgeId"].(string); exists {
		for _, edge := range architecture.Edges {
			if edge.ID == edgeID {
				return true
			}
		}
		return false
	}
	return true
}

func applyTopologyEvent(architecture ReplayArchitecture, eventType string, payload map[string]any) (ReplayArchitecture, error) {
	switch eventType {
	case "node.added":
		node, err := decodeNode(payload["node"])
		if err != nil {
			return ReplayArchitecture{}, err
		}
		architecture.Nodes = replaceNode(architecture.Nodes, node)
	case "node.removed":
		nodeID, _ := payload["nodeId"].(string)
		nodes := architecture.Nodes[:0]
		for _, node := range architecture.Nodes {
			if node.ID != nodeID {
				nodes = append(nodes, node)
			}
		}
		architecture.Nodes = nodes
		edges := architecture.Edges[:0]
		for _, edge := range architecture.Edges {
			if edge.Source != nodeID && edge.Target != nodeID {
				edges = append(edges, edge)
			}
		}
		architecture.Edges = edges
	case "edge.added":
		edge, err := decodeEdge(payload["edge"])
		if err != nil {
			return ReplayArchitecture{}, err
		}
		architecture.Edges = replaceEdge(architecture.Edges, edge)
	case "edge.removed":
		edgeID, _ := payload["edgeId"].(string)
		edges := architecture.Edges[:0]
		for _, edge := range architecture.Edges {
			if edge.ID != edgeID {
				edges = append(edges, edge)
			}
		}
		architecture.Edges = edges
	case "architecture.replaced":
		next, err := decodeArchitecture(payload["architecture"])
		if err != nil {
			return ReplayArchitecture{}, err
		}
		architecture = cloneArchitecture(next)
	}
	return architecture, nil
}

func cloneArchitecture(source ReplayArchitecture) ReplayArchitecture {
	return ReplayArchitecture{
		Nodes: append([]ReplayNode(nil), source.Nodes...),
		Edges: append([]ReplayEdge(nil), source.Edges...),
	}
}

func decodeNode(value any) (ReplayNode, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return ReplayNode{}, err
	}
	var node ReplayNode
	if err := json.Unmarshal(raw, &node); err != nil {
		return ReplayNode{}, err
	}
	return node, nil
}

func decodeEdge(value any) (ReplayEdge, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return ReplayEdge{}, err
	}
	var edge ReplayEdge
	if err := json.Unmarshal(raw, &edge); err != nil {
		return ReplayEdge{}, err
	}
	return edge, nil
}

func replaceNode(nodes []ReplayNode, replacement ReplayNode) []ReplayNode {
	next := make([]ReplayNode, 0, len(nodes)+1)
	for _, node := range nodes {
		if node.ID != replacement.ID {
			next = append(next, node)
		}
	}
	return append(next, replacement)
}

func replaceEdge(edges []ReplayEdge, replacement ReplayEdge) []ReplayEdge {
	next := make([]ReplayEdge, 0, len(edges)+1)
	for _, edge := range edges {
		if edge.ID != replacement.ID {
			next = append(next, edge)
		}
	}
	return append(next, replacement)
}

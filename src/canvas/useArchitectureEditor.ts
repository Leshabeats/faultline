import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { SystemFlowEdge, SystemFlowNode } from './types'
import type {
  CapacityTuning,
  ComponentKind,
  Locale,
  LoadMultiplier,
  SimulationSnapshot,
  TimelineEvent,
} from '../domain/system'
import {
  databaseReadReplicas,
  normalizeNodeTopology,
  type NodeTopology,
} from '../domain/topology'
import { componentLabels } from '../i18n'
import type { ReplayEventContentV1 } from '../replay'
import {
  createStableId,
  toReplayEdge,
  toReplayNode,
} from '../replay/presentation'
import { applicationCopy, componentAddedCopy } from '../application/copy'

interface UseArchitectureEditorInput {
  nodes: SystemFlowNode[]
  load: LoadMultiplier
  playing: boolean
  locale: Locale
  capacity: CapacityTuning
  snapshot: SimulationSnapshot
  setNodes: Dispatch<SetStateAction<SystemFlowNode[]>>
  setEdges: Dispatch<SetStateAction<SystemFlowEdge[]>>
  setCapacity: Dispatch<SetStateAction<CapacityTuning>>
  setActiveKind: Dispatch<SetStateAction<ComponentKind>>
  addEvent: (title: string, detail: string, tone?: TimelineEvent['tone']) => void
  recordAction: (event: ReplayEventContentV1) => unknown
}

/** Owns editable-canvas commands and their replay representation. */
export function useArchitectureEditor({
  nodes,
  load,
  playing,
  locale,
  capacity,
  snapshot,
  setNodes,
  setEdges,
  setCapacity,
  setActiveKind,
  addEvent,
  recordAction,
}: UseArchitectureEditorInput) {
  const copy = applicationCopy[locale]

  const onNodesChange = useCallback((changes: NodeChange<SystemFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
    changes.forEach((change) => {
      if (change.type !== 'remove') return
      recordAction({
        type: 'node.removed',
        source: 'user',
        payload: { nodeId: change.id },
        timeline: {
          title: copy.componentRemoved,
          detail: copy.topologyRecalculated,
          tone: 'warning',
        },
      })
    })
  }, [copy.componentRemoved, copy.topologyRecalculated, recordAction, setNodes])

  const onNodeDragStop = useCallback((node: SystemFlowNode) => {
    recordAction({
      type: 'node.updated',
      source: 'user',
      payload: { nodeId: node.id, patch: { position: { ...node.position } } },
      timeline: {
        title: locale === 'ru' ? `${node.data.label}: положение изменено` : `${node.data.label} moved`,
        detail: copy.layoutUpdated,
        tone: 'neutral',
      },
    })
  }, [copy.layoutUpdated, locale, recordAction])

  const onEdgesChange = useCallback((changes: EdgeChange<SystemFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
    changes.forEach((change) => {
      if (change.type !== 'remove') return
      recordAction({
        type: 'edge.removed',
        source: 'user',
        payload: { edgeId: change.id },
        timeline: {
          title: copy.connectionRemoved,
          detail: copy.topologyRecalculated,
          tone: 'warning',
        },
      })
    })
  }, [copy.connectionRemoved, copy.topologyRecalculated, recordAction, setEdges])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    const edge: SystemFlowEdge = {
      ...connection,
      id: createStableId('edge'),
      type: 'traffic',
      data: { tone: 'healthy', intensity: load, paused: !playing },
    }
    setEdges((current) => addEdge<SystemFlowEdge>(edge, current))
    addEvent(copy.connectionAdded, copy.topologyRecalculated, 'healthy')
    recordAction({
      type: 'edge.added',
      source: 'user',
      payload: { edge: toReplayEdge(edge) },
      timeline: {
        title: copy.connectionAdded,
        detail: copy.topologyRecalculated,
        tone: 'healthy',
      },
    })
  }, [addEvent, copy.connectionAdded, copy.topologyRecalculated, load, playing, recordAction, setEdges])

  const addNode = useCallback((kind: ComponentKind) => {
    setActiveKind(kind)
    const instance = nodes.filter((node) => node.data.kind === kind).length + 1
    const baseLabel = componentLabels[locale][kind]
    const label = `${baseLabel}${instance > 1 ? ` ${instance}` : ''}`
    const node: SystemFlowNode = {
      id: createStableId(kind),
      type: 'system',
      selected: true,
      position: {
        x: 360 + (nodes.length % 4) * 42,
        y: 120 + (nodes.length % 3) * 95,
      },
      data: {
        kind,
        label,
        health: snapshot.nodeHealth[kind] ?? 'healthy',
        detail: snapshot.nodeDetails[kind] ?? (locale === 'ru' ? 'Исправен' : 'Healthy'),
        load,
      },
    }
    setNodes((current) => [
      ...current.map((item) => ({ ...item, selected: false })),
      node,
    ])
    const addedCopy = componentAddedCopy(locale, kind, label)
    addEvent(addedCopy.eventTitle, addedCopy.detail, 'healthy')
    recordAction({
      type: 'node.added',
      source: 'user',
      payload: { node: toReplayNode(node) },
      timeline: {
        title: addedCopy.timelineTitle,
        detail: addedCopy.detail,
        tone: 'healthy',
      },
    })
  }, [addEvent, load, locale, nodes, recordAction, setActiveKind, setNodes, snapshot.nodeDetails, snapshot.nodeHealth])

  const changeNodeTopology = useCallback((nodeId: string, input: NodeTopology) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    const { replicas, shards } = normalizeNodeTopology(node.data.kind, input)
    setNodes((current) => current.map((item) => item.id === nodeId
      ? { ...item, data: { ...item.data, replicas, shards } }
      : item))

    if (node.data.kind === 'database') {
      const readReplicas = databaseReadReplicas({ replicas })
      const nextCapacity = { ...capacity, readReplicas }
      setCapacity(nextCapacity)
      recordAction({
        type: 'capacity.changed',
        source: 'user',
        payload: {
          capacity: nextCapacity,
          topology: [{ nodeId, replicas, shards }],
        },
        timeline: {
          title: locale === 'ru' ? 'Репликация БД обновлена' : 'Database replication updated',
          detail: locale === 'ru'
            ? `${readReplicas} репл. чтения`
            : `${readReplicas} read replica${readReplicas === 1 ? '' : 's'}`,
          tone: 'neutral',
        },
      })
    }

    addEvent(
      locale === 'ru' ? 'Топология обновлена' : 'Topology updated',
      locale === 'ru'
        ? `${node.data.label}: ${replicas} репл., ${shards} шард.`
        : `${node.data.label}: ${replicas} replicas, ${shards} shards`,
      'neutral',
    )
    if (node.data.kind !== 'database') {
      recordAction({
        type: 'node.updated',
        source: 'user',
        payload: { nodeId, patch: { data: { replicas, shards } } },
        timeline: {
          title: locale === 'ru' ? 'Топология обновлена' : 'Topology updated',
          detail: locale === 'ru'
            ? `${node.data.label}: ${replicas}× / ${shards} шард.`
            : `${node.data.label}: ${replicas}× / ${shards} shards`,
          tone: 'neutral',
        },
      })
    }
  }, [addEvent, capacity, locale, nodes, recordAction, setCapacity, setNodes])

  return {
    onNodesChange,
    onNodeDragStop,
    onEdgesChange,
    onConnect,
    addNode,
    changeNodeTopology,
  }
}

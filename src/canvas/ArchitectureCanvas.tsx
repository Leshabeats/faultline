import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import type { ComponentKind, TelemetryPoint } from '../domain/system'
import { ComponentDock } from '../components/ComponentDock'
import { SimulationControls } from '../components/SimulationControls'
import { TelemetryRibbon } from '../components/TelemetryRibbon'
import { SystemNode } from './SystemNode'
import { TrafficEdge } from './TrafficEdge'
import type { SystemFlowEdge, SystemFlowNode } from './types'
import type { FaultMode } from '../domain/system'
import { useEffect, useRef, type ReactNode } from 'react'

const nodeTypes = { system: SystemNode }
const edgeTypes = { traffic: TrafficEdge }

interface ArchitectureCanvasProps {
  nodes: SystemFlowNode[]
  edges: SystemFlowEdge[]
  activeKind: ComponentKind
  load: 1 | 3 | 10
  fault: FaultMode
  telemetry: TelemetryPoint[]
  onNodesChange: (changes: NodeChange<SystemFlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<SystemFlowEdge>[]) => void
  onConnect: (connection: Connection) => void
  onNodeDragStop?: (node: SystemFlowNode) => void
  onAddNode: (kind: ComponentKind) => void
  onNodeKindSelected: (kind: ComponentKind) => void
  onLoadChange: (load: 1 | 3 | 10) => void
  onFaultChange: (fault: FaultMode) => void
  readOnly?: boolean
  bottomOverlay?: ReactNode
  fitViewKey?: string
  faults: readonly FaultMode[]
  telemetryLabels?: Partial<Record<'throughput' | 'p99' | 'errorRate' | 'dbCpu', string>>
  canvasLabel?: string
}

export function ArchitectureCanvas({
  nodes,
  edges,
  activeKind,
  load,
  fault,
  telemetry,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStop,
  onAddNode,
  onNodeKindSelected,
  onLoadChange,
  onFaultChange,
  readOnly = false,
  bottomOverlay,
  fitViewKey,
  faults,
  telemetryLabels,
  canvasLabel = 'System architecture',
}: ArchitectureCanvasProps) {
  const flowRef = useRef<ReactFlowInstance<SystemFlowNode, SystemFlowEdge> | null>(null)

  useEffect(() => {
    if (!fitViewKey) return
    const frame = window.requestAnimationFrame(() => {
      void flowRef.current?.fitView({ padding: 0.18, maxZoom: 1, duration: 260 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [fitViewKey])

  return (
    <main className="canvas-region" aria-label="System architecture canvas">
      <ReactFlow<SystemFlowNode, SystemFlowEdge>
        key={fitViewKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={readOnly || !onNodeDragStop ? undefined : (_, node) => onNodeDragStop(node)}
        onNodeClick={readOnly ? undefined : (_, node) => onNodeKindSelected(node.data.kind)}
        defaultEdgeOptions={{
          type: 'traffic',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        }}
        fitView
        onInit={(instance) => { flowRef.current = instance }}
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.38}
        maxZoom={1.8}
        panOnScroll
        selectionOnDrag={!readOnly}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        nodesFocusable={!readOnly}
        edgesFocusable={!readOnly}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        aria-label={readOnly ? `Read-only ${canvasLabel} replay` : `Editable ${canvasLabel}`}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#dfe4ea"
        />
        <Controls
          className="canvas-zoom-controls"
          showInteractive={false}
          position="bottom-right"
        />
      </ReactFlow>
      {!readOnly && <ComponentDock activeKind={activeKind} onAdd={onAddNode} />}
      {!readOnly && <TelemetryRibbon history={telemetry} labels={telemetryLabels} />}
      {!readOnly && <SimulationControls
          load={load}
          fault={fault}
          onLoadChange={onLoadChange}
          onFaultChange={onFaultChange}
          onQuickAdd={onAddNode}
          faults={faults}
        />}
      {bottomOverlay}
    </main>
  )
}

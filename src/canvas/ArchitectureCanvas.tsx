import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import type { ComponentKind, TelemetryPoint } from '../domain/system'
import { ComponentDock } from '../components/ComponentDock'
import { SimulationControls } from '../components/SimulationControls'
import { TelemetryRibbon } from '../components/TelemetryRibbon'
import { SystemNode } from './SystemNode'
import { TrafficEdge } from './TrafficEdge'
import type { SystemFlowEdge, SystemFlowNode } from './types'
import type { FaultMode } from '../domain/system'

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
  onAddNode: (kind: ComponentKind) => void
  onNodeKindSelected: (kind: ComponentKind) => void
  onLoadChange: (load: 1 | 3 | 10) => void
  onFaultChange: (fault: FaultMode) => void
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
  onAddNode,
  onNodeKindSelected,
  onLoadChange,
  onFaultChange,
}: ArchitectureCanvasProps) {
  return (
    <main className="canvas-region" aria-label="System architecture canvas">
      <ReactFlow<SystemFlowNode, SystemFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeKindSelected(node.data.kind)}
        defaultEdgeOptions={{
          type: 'traffic',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.38}
        maxZoom={1.8}
        panOnScroll
        selectionOnDrag
        nodesFocusable
        edgesFocusable
        deleteKeyCode={['Backspace', 'Delete']}
        aria-label="Editable URL shortener architecture"
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
      <ComponentDock activeKind={activeKind} onAdd={onAddNode} />
      <TelemetryRibbon history={telemetry} />
      <SimulationControls
        load={load}
        fault={fault}
        onLoadChange={onLoadChange}
        onFaultChange={onFaultChange}
        onQuickAdd={onAddNode}
      />
    </main>
  )
}

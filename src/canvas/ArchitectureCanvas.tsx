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
import type { ComponentKind, LoadMultiplier, Locale, ScenarioId, TelemetryPoint } from '../domain/system'
import { ComponentDock } from '../components/ComponentDock'
import { ComponentInspector } from '../components/ComponentInspector'
import { SimulationControls } from '../components/SimulationControls'
import { TelemetryRibbon } from '../components/TelemetryRibbon'
import { SystemNode } from './SystemNode'
import { TrafficEdge } from './TrafficEdge'
import type { SystemFlowEdge, SystemFlowNode } from './types'
import type { FaultMode } from '../domain/system'
import type { NodeTopology } from '../domain/topology'
import { useEffect, useRef, type ReactNode } from 'react'

const nodeTypes = { system: SystemNode }
const edgeTypes = { traffic: TrafficEdge }

interface ArchitectureCanvasProps {
  nodes: SystemFlowNode[]
  edges: SystemFlowEdge[]
  activeKind: ComponentKind
  load: LoadMultiplier
  effectiveLoad: number
  fault: FaultMode
  locale: Locale
  scenario: ScenarioId
  selectedNode: SystemFlowNode | null
  telemetry: TelemetryPoint[]
  onNodesChange: (changes: NodeChange<SystemFlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<SystemFlowEdge>[]) => void
  onConnect: (connection: Connection) => void
  onNodeDragStop?: (node: SystemFlowNode) => void
  onAddNode: (kind: ComponentKind) => void
  onNodeSelected: (node: SystemFlowNode) => void
  onInspectorClose: () => void
  onTopologyChange: (nodeId: string, topology: NodeTopology) => void
  onLoadChange: (load: LoadMultiplier) => void
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
  effectiveLoad,
  fault,
  locale,
  scenario,
  selectedNode,
  telemetry,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStop,
  onAddNode,
  onNodeSelected,
  onInspectorClose,
  onTopologyChange,
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
  }, [fitViewKey, selectedNode?.id])

  return (
    <main className={`canvas-region ${selectedNode ? 'inspector-visible' : ''}`} aria-label={locale === 'ru' ? 'Схема архитектуры системы' : 'System architecture canvas'}>
      <div className="flow-surface">
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
          onNodeClick={readOnly ? undefined : (_, node) => onNodeSelected(node)}
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
          aria-label={readOnly
            ? locale === 'ru' ? `Повтор: ${canvasLabel}` : `Read-only ${canvasLabel} replay`
            : locale === 'ru' ? `Редактируемая схема: ${canvasLabel}` : `Editable ${canvasLabel}`}
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
        {!readOnly && <ComponentDock activeKind={activeKind} onAdd={onAddNode} locale={locale} />}
        {!readOnly && <TelemetryRibbon history={telemetry} labels={telemetryLabels} locale={locale} />}
        {!readOnly && <SimulationControls
          load={load}
          effectiveLoad={effectiveLoad}
          fault={fault}
          locale={locale}
          onLoadChange={onLoadChange}
          onFaultChange={onFaultChange}
          onQuickAdd={onAddNode}
          faults={faults}
        />}
        {bottomOverlay}
      </div>
      {!readOnly && <ComponentInspector
        node={selectedNode}
        scenario={scenario}
        locale={locale}
        fault={fault}
        onClose={onInspectorClose}
        onFaultChange={onFaultChange}
        onTopologyChange={onTopologyChange}
      />}
    </main>
  )
}

import { useState, useCallback, useRef } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, Handle, Position, MarkerType,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import type { OrgChart } from '@/lib/types';

interface PositionNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
}

/* This canvas, like FlowchartCanvas, is always rendered on a fixed white
   surface regardless of the app's light/dark theme, so colors here are
   fixed literals rather than theme-reactive Tailwind tokens. */
function PositionNode({ data }: NodeProps) {
  const d = data as PositionNodeData;
  return (
    <div className="min-w-[170px] max-w-[220px] rounded-lg border-2 border-[#cbd5e1] bg-white px-3.5 py-2.5 text-center shadow-sm">
      <Handle type="target" position={Position.Top} />
      <p className="text-xs font-semibold text-[#1e293b]">{d.label}</p>
      {d.sublabel && <p className="mt-0.5 text-[10px] text-[#94a3b8]">{d.sublabel}</p>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = { position: PositionNode };

function toRFNodes(nodes: OrgChart['nodes']): Node[] {
  return nodes.map((n) => ({
    id: n.id, type: 'position', position: n.position,
    data: { label: n.label, sublabel: n.sublabel },
  }));
}
function toRFEdges(edges: OrgChart['edges']): Edge[] {
  return edges.map((e) => ({
    id: e.id, source: e.source, target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 },
  }));
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function OrgChartCanvas({
  chart, editable = false, onSave, height = '480px',
}: {
  chart: OrgChart;
  editable?: boolean;
  onSave?: (chart: OrgChart) => void;
  height?: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(toRFNodes(chart?.nodes ?? []));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toRFEdges(chart?.edges ?? []));
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
  const [nodeLabel, setNodeLabel] = useState('');
  const [nodeSublabel, setNodeSublabel] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, id: nextId('e'), markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 } }, eds));
  }, [setEdges]);

  function openNodeEditor(node: Node) {
    if (!editable) return;
    const d = node.data as PositionNodeData;
    setEditingNode(node);
    setNodeLabel(d.label ?? '');
    setNodeSublabel(d.sublabel ?? '');
  }

  function saveNodeEdit() {
    if (!editingNode) return;
    setNodes((nds) => nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, label: nodeLabel, sublabel: nodeSublabel || undefined } } : n)));
    setEditingNode(null);
  }

  function deleteNode() {
    if (!editingNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== editingNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== editingNode.id && e.target !== editingNode.id));
    setEditingNode(null);
  }

  function openEdgeEditor(edge: Edge) {
    if (!editable) return;
    setEditingEdge(edge);
  }

  function deleteEdge() {
    if (!editingEdge) return;
    setEdges((eds) => eds.filter((e) => e.id !== editingEdge.id));
    setEditingEdge(null);
  }

  function addNode() {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const centerX = bounds ? bounds.width / 2 - 90 : 250;
    const newNode: Node = { id: nextId('node'), type: 'position', position: { x: centerX, y: 40 + nodes.length * 20 }, data: { label: 'New Position' } };
    setNodes((nds) => [...nds, newNode]);
    openNodeEditor(newNode);
  }

  function handleSave() {
    if (!onSave) return;
    const chartNodes: OrgChart['nodes'] = nodes.map((n) => {
      const d = n.data as PositionNodeData;
      return { id: n.id, label: d.label, sublabel: d.sublabel, position: n.position };
    });
    const chartEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    onSave({ nodes: chartNodes, edges: chartEdges });
  }

  return (
    <ReactFlowProvider>
      <div className="space-y-2">
        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={addNode}><UserPlus className="h-3.5 w-3.5" /> Add Position</Button>
            {onSave && <Button size="sm" onClick={handleSave}><Save className="h-3.5 w-3.5" /> Save Chart</Button>}
          </div>
        )}
        <div ref={wrapperRef} className="overflow-hidden rounded-lg border border-slate-200 bg-white" style={{ height }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={editable ? onConnect : undefined}
            onNodeClick={(_, node) => openNodeEditor(node)}
            onEdgeClick={(_, edge) => openEdgeEditor(edge)}
            nodeTypes={nodeTypes}
            nodesDraggable={editable}
            nodesConnectable={editable}
            elementsSelectable={editable}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background gap={16} color="#e2e8f0" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden sm:!block" />
          </ReactFlow>
        </div>
        {editable && <p className="text-xs text-slate-400">Click a position to edit its title or remove it; drag from the dot at the top/bottom of a box to draw a new reporting line. Click a line to delete it.</p>}
      </div>

      <Dialog open={!!editingNode} onClose={() => setEditingNode(null)} title="Edit Position" size="sm" footer={
        <>
          <Button variant="outline" onClick={deleteNode} className="mr-auto text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</Button>
          <Button variant="outline" onClick={() => setEditingNode(null)}>Cancel</Button>
          <Button onClick={saveNodeEdit}>Save</Button>
        </>
      }>
        <div className="space-y-3">
          <div>
            <Label htmlFor="pos-label">Position Title</Label>
            <Input id="pos-label" value={nodeLabel} onChange={(e) => setNodeLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pos-sub">Grade / Headcount (optional)</Label>
            <Input id="pos-sub" value={nodeSublabel} onChange={(e) => setNodeSublabel(e.target.value)} placeholder="e.g. [1] SG 18,19,20" />
          </div>
        </div>
      </Dialog>

      <Dialog open={!!editingEdge} onClose={() => setEditingEdge(null)} title="Reporting Line" size="sm" footer={
        <>
          <Button variant="outline" onClick={deleteEdge} className="mr-auto text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</Button>
          <Button variant="outline" onClick={() => setEditingEdge(null)}>Cancel</Button>
        </>
      }>
        <p className="text-sm text-slate-500">Delete this reporting line, or cancel to keep it.</p>
      </Dialog>
    </ReactFlowProvider>
  );
}

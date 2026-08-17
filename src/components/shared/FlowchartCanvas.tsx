import { useState, useCallback, useRef } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, Handle, Position, MarkerType,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Trash2, Diamond, Square, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import type { QmsFlowchart, QmsFlowNode, QmsFlowNodeType } from '@/lib/types';

interface FlowNodeData extends Record<string, unknown> {
  label: string;
  responsibility?: string;
  interfaceRef?: string;
}

/* This canvas is always rendered on a fixed white surface (regardless of
   the app's light/dark theme, to keep React Flow's own chrome consistent),
   so every color here must be a fixed literal — theme-reactive Tailwind
   tokens like `bg-gold-50`/`text-slate-800` would flip to dark-mode values
   while the background stays white, making content unreadable. */
function StartEndNode({ data }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <div className="flex h-11 min-w-[130px] items-center justify-center rounded-full border-2 border-[#22c55e] bg-[#ecfdf5] px-4 text-center text-xs font-semibold text-[#0b6b3a] shadow-sm">
      <Handle type="target" position={Position.Top} />
      {d.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ProcessNode({ data }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <div className="min-w-[190px] max-w-[240px] rounded-lg border-2 border-[#cbd5e1] bg-white px-3 py-2 text-center shadow-sm">
      <Handle type="target" position={Position.Top} />
      {d.responsibility && <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#16a34a]">{d.responsibility}</p>}
      <p className="text-xs font-medium text-[#1e293b]">{d.label}</p>
      {d.interfaceRef && <p className="mt-1 text-[10px] text-[#94a3b8]">{d.interfaceRef}</p>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function DecisionNode({ data }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <div className="relative flex h-[120px] w-[190px] flex-col items-center justify-center">
      {d.responsibility && <span className="absolute -top-5 text-[10px] font-semibold uppercase tracking-wide text-[#895616]">{d.responsibility}</span>}
      {/* True diamond via clip-path — rotating a non-square box (rotate-45)
          produces a lopsided rhombus, not a diamond. clip-path stays a
          clean 4-point diamond for any width/height. */}
      <div
        className="absolute inset-0 border-2 border-[#cf8f1c] bg-[#fdf8ec]"
        style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
      />
      <Handle type="target" position={Position.Top} />
      <p className="relative z-10 max-w-[100px] px-2 text-center text-[11px] font-semibold text-[#5f3a19]">{d.label}</p>
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  );
}

const nodeTypes: NodeTypes = { start: StartEndNode, end: StartEndNode, process: ProcessNode, decision: DecisionNode };

function toRFNodes(nodes: QmsFlowNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id, type: n.type, position: n.position,
    data: { label: n.label, responsibility: n.responsibility, interfaceRef: n.interfaceRef },
  }));
}
function toRFEdges(edges: QmsFlowchart['edges']): Edge[] {
  return edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 },
  }));
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function FlowchartCanvas({
  flowchart, editable = false, onSave, height = '480px',
}: {
  flowchart: QmsFlowchart;
  editable?: boolean;
  onSave?: (flowchart: QmsFlowchart) => void;
  height?: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(toRFNodes(flowchart?.nodes ?? []));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toRFEdges(flowchart?.edges ?? []));
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
  const [nodeLabel, setNodeLabel] = useState('');
  const [nodeResp, setNodeResp] = useState('');
  const [nodeRef, setNodeRef] = useState('');
  const [edgeLabel, setEdgeLabel] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, id: nextId('e'), markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 } }, eds));
  }, [setEdges]);

  function openNodeEditor(node: Node) {
    if (!editable) return;
    const d = node.data as FlowNodeData;
    setEditingNode(node);
    setNodeLabel(d.label ?? '');
    setNodeResp(d.responsibility ?? '');
    setNodeRef(d.interfaceRef ?? '');
  }

  function saveNodeEdit() {
    if (!editingNode) return;
    setNodes((nds) => nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, label: nodeLabel, responsibility: nodeResp || undefined, interfaceRef: nodeRef || undefined } } : n)));
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
    setEdgeLabel(typeof edge.label === 'string' ? edge.label : '');
  }

  function saveEdgeEdit() {
    if (!editingEdge) return;
    setEdges((eds) => eds.map((e) => (e.id === editingEdge.id ? { ...e, label: edgeLabel || undefined } : e)));
    setEditingEdge(null);
  }

  function deleteEdge() {
    if (!editingEdge) return;
    setEdges((eds) => eds.filter((e) => e.id !== editingEdge.id));
    setEditingEdge(null);
  }

  function addNode(type: QmsFlowNodeType) {
    const label = type === 'decision' ? 'New Decision?' : type === 'process' ? 'New Step' : type === 'start' ? 'Start' : 'End';
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const centerX = bounds ? bounds.width / 2 - 90 : 250;
    const newNode: Node = { id: nextId('node'), type, position: { x: centerX, y: 40 + nodes.length * 30 }, data: { label } };
    setNodes((nds) => [...nds, newNode]);
    openNodeEditor(newNode);
  }

  function handleSave() {
    if (!onSave) return;
    const qmsNodes: QmsFlowNode[] = nodes.map((n) => {
      const d = n.data as FlowNodeData;
      return { id: n.id, type: n.type as QmsFlowNodeType, label: d.label, responsibility: d.responsibility, interfaceRef: d.interfaceRef, position: n.position };
    });
    const qmsEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, label: typeof e.label === 'string' ? e.label : undefined }));
    onSave({ nodes: qmsNodes, edges: qmsEdges });
  }

  return (
    <ReactFlowProvider>
      <div className="space-y-2">
        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => addNode('process')}><Square className="h-3.5 w-3.5" /> Add Step</Button>
              <Button variant="outline" size="sm" onClick={() => addNode('decision')}><Diamond className="h-3.5 w-3.5" /> Add Decision</Button>
              <Button variant="outline" size="sm" onClick={() => addNode('start')}><CircleDot className="h-3.5 w-3.5" /> Add Start</Button>
              <Button variant="outline" size="sm" onClick={() => addNode('end')}><CircleDot className="h-3.5 w-3.5" /> Add End</Button>
            </div>
            {onSave && <Button size="sm" onClick={handleSave}><Save className="h-3.5 w-3.5" /> Save Flowchart</Button>}
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
        {editable && <p className="text-xs text-slate-400">Click a step or decision to edit its text; drag from the dot at the bottom/side of a shape to connect it to another. Click a connector to label it (e.g. "YES" / "NO").</p>}
      </div>

      <Dialog open={!!editingNode} onClose={() => setEditingNode(null)} title="Edit Step" size="sm" footer={
        <>
          <Button variant="outline" onClick={deleteNode} className="mr-auto text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</Button>
          <Button variant="outline" onClick={() => setEditingNode(null)}>Cancel</Button>
          <Button onClick={saveNodeEdit}>Save</Button>
        </>
      }>
        <div className="space-y-3">
          <div>
            <Label htmlFor="node-label">Label</Label>
            <Textarea id="node-label" value={nodeLabel} onChange={(e) => setNodeLabel(e.target.value)} rows={2} />
          </div>
          {editingNode?.type !== 'start' && editingNode?.type !== 'end' && (
            <>
              <div>
                <Label htmlFor="node-resp">Responsibility</Label>
                <Input id="node-resp" value={nodeResp} onChange={(e) => setNodeResp(e.target.value)} placeholder="e.g. SEMO" />
              </div>
              <div>
                <Label htmlFor="node-ref">Interface / Reference</Label>
                <Input id="node-ref" value={nodeRef} onChange={(e) => setNodeRef(e.target.value)} placeholder="e.g. F-NSD-13 — Job Order" />
              </div>
            </>
          )}
        </div>
      </Dialog>

      <Dialog open={!!editingEdge} onClose={() => setEditingEdge(null)} title="Edit Connector" size="sm" footer={
        <>
          <Button variant="outline" onClick={deleteEdge} className="mr-auto text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</Button>
          <Button variant="outline" onClick={() => setEditingEdge(null)}>Cancel</Button>
          <Button onClick={saveEdgeEdit}>Save</Button>
        </>
      }>
        <Label htmlFor="edge-label">Label (optional)</Label>
        <Input id="edge-label" value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)} placeholder="e.g. YES / NO" />
      </Dialog>
    </ReactFlowProvider>
  );
}

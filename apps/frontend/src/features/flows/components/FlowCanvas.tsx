import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/components/theme/ThemeProvider';
import { FlowEdge } from './edges/FlowEdge.js';
import { FlowNode } from './nodes/FlowNode.js';

const nodeTypes: NodeTypes = { flowNode: FlowNode };
const edgeTypes: EdgeTypes = { flowEdge: FlowEdge };

// Sin `maxZoom: 1` en `fitView`, un canvas con un solo nodo hace zoom hasta el máximo de la
// librería (2x) para llenar el viewport, y el primer nodo aparece enorme. El padding deja aire
// alrededor cuando hay varios.
const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.4 };

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  onNodeClick: (nodeId: string) => void;
  onPaneClick: () => void;
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
}: FlowCanvasProps): React.ReactElement {
  const defaultEdgeOptions = useMemo(() => ({ style: { strokeWidth: 1.5 } }), []);
  // Sin `colorMode`, ReactFlow pone la clase `light` en su raíz y el bloque `.light` de `index.css`
  // (el pin de "forzar light") vuelve a declarar los tokens claros DENTRO del canvas: nodos,
  // controles y fondo quedaban blancos aunque `<html>` tuviera `.dark`.
  const { resolvedTheme } = useTheme();

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={400}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={resolvedTheme}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_e, node) => onNodeClick(node.id)}
        onPaneClick={onPaneClick}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS} />
      </ReactFlow>
    </TooltipProvider>
  );
}

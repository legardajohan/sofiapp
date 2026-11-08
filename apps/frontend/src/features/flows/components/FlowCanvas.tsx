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
  type OnBeforeDelete,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodesDelete,
  type ReactFlowInstance,
  type Viewport,
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

/** Borrar lo seleccionado (enlace o nodo) con `Supr` y con `Retroceso` (HU-FLOW-05, criterio 31).
 *  React Flow solo trae `Backspace` por defecto, así que en teclados donde «Supr» es la tecla
 *  natural de borrar no pasaba nada. Se ignora solo si el foco está en un campo de texto. */
const TECLAS_BORRAR = ['Delete', 'Backspace'];

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  /** Se llama con los enlaces que el usuario borró (enlaces de ramas incluidos). */
  onEdgesDelete: OnEdgesDelete;
  onNodesDelete: OnNodesDelete;
  /** Permite vetar un borrado (p. ej. el nodo de inicio). */
  onBeforeDelete: OnBeforeDelete;
  /** Entrega la instancia de React Flow (para centrar la cámara en un nodo con error). */
  onInit?: (instancia: ReactFlowInstance) => void;
  /** Encuadre que dejó el usuario; si existe, se restaura en vez de recalcularlo con `fitView`. */
  vistaInicial?: Viewport | null;
  /** Se llama al terminar de mover o hacer zoom, con el encuadre actual. */
  onVistaCambiada?: (vista: Viewport) => void;
  onNodeClick: (nodeId: string) => void;
  onPaneClick: () => void;
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgesDelete,
  onNodesDelete,
  onBeforeDelete,
  onInit,
  vistaInicial,
  onVistaCambiada,
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
        deleteKeyCode={TECLAS_BORRAR}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={onNodesDelete}
        onBeforeDelete={onBeforeDelete}
        onInit={onInit}
        onNodeClick={(_e, node) => onNodeClick(node.id)}
        onPaneClick={onPaneClick}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView={!vistaInicial}
        defaultViewport={vistaInicial ?? undefined}
        onMoveEnd={onVistaCambiada ? (_e, vista) => onVistaCambiada(vista) : undefined}
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

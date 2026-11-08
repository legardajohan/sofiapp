import { useMemo } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { ErrorGrafo } from '@sofiapp/shared';
import { agruparPorNodo, analizarFlujo } from '../lib/graph.js';
import type { FlowNodeData } from '../components/nodes/FlowNode.js';

export interface EstadoGrafo {
  errores: ErrorGrafo[];
  /** `nodeId -> errores`. Un nodo que no aparece aquí está listo. */
  porNodo: Map<string, ErrorGrafo[]>;
  /** Cuántos NODOS (no errores) tienen algo pendiente. */
  nodosConError: number;
}

/**
 * Errores de conexión y de contenido del grafo, recalculados **en vivo** (HU-FLOW-05, criterio 26):
 * es un valor derivado de `nodes`/`edges`/`entrada`, así que en cuanto se corrige una conexión el
 * nodo deja de estar en rojo sin pasar por «Guardar» ni por el servidor.
 */
export function useGraphErrors(nodes: Node[], edges: Edge[], entrada: string): EstadoGrafo {
  return useMemo(() => {
    const nodos = nodes.map((n) => (n.data as FlowNodeData).nodo);
    const errores = analizarFlujo(
      nodos,
      edges.map((e) => ({ from: e.source, to: e.target })),
      entrada,
    );
    const porNodo = agruparPorNodo(errores);
    return { errores, porNodo, nodosConError: porNodo.size };
  }, [nodes, edges, entrada]);
}

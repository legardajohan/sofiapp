import { create } from 'zustand';

/**
 * Estado de UI del editor de flujos, no datos del servidor — el grafo (`nodos`/`aristas`) vive
 * como estado local de `FlowEditorPage` (vía `useNodesState`/`useEdgesState` de `@xyflow/react`);
 * aquí solo lo que es puramente de interfaz: qué nodo está seleccionado y los errores de
 * validación del último intento de guardado, para anclarlos al nodo culpable (criterio 21).
 */
interface FlowEditorState {
  selectedNodeId: string | null;
  select: (id: string | null) => void;
  /** `nodeId -> mensaje`. Se limpia al cambiar de flujo o al reintentar guardar con éxito. */
  nodeErrors: Record<string, string>;
  setNodeErrors: (errors: Record<string, string>) => void;
  reset: () => void;
}

export const useFlowStore = create<FlowEditorState>((set) => ({
  selectedNodeId: null,
  select: (id) => set({ selectedNodeId: id }),
  nodeErrors: {},
  setNodeErrors: (nodeErrors) => set({ nodeErrors }),
  reset: () => set({ selectedNodeId: null, nodeErrors: {} }),
}));

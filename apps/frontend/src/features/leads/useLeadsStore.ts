import { create } from 'zustand';

/**
 * Estado de UI del listado, no datos del servidor — eso vive en TanStack Query.
 *
 * Los filtros NO están aquí a propósito: viven en la URL para que la vista se comparta por enlace
 * y sobreviva al refresco. Aquí solo queda qué fila tiene el panel abierto.
 */
interface LeadsState {
  selectedId: string | null;
  select: (id: string | null) => void;
}

export const useLeadsStore = create<LeadsState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
}));

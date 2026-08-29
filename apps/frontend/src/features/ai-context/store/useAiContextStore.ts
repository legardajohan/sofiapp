import { create } from 'zustand';

/** Estado de UI de la vista Fuentes/Contexto (no datos del servidor — eso vive en TanStack Query). */
interface AiContextState {
  selectedId: string | null;
  select: (id: string | null) => void;
}

export const useAiContextStore = create<AiContextState>((set) => ({
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
}));

import { create } from 'zustand';

/** Estado de UI de la bandeja (no datos del servidor — eso vive en TanStack Query). */
interface InboxState {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /**
   * Ficha del contacto (columna lateral, HU-OMNI-03). `false` la colapsa a una franja estrecha
   * en vez de cerrarla: la ficha sigue accesible de un clic y la conversación nunca queda tapada.
   */
  contactPanelOpen: boolean;
  setContactPanelOpen: (open: boolean) => void;
  toggleContactPanel: () => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  activeId: null,
  setActiveId: (activeId) => set({ activeId }),
  contactPanelOpen: false,
  setContactPanelOpen: (contactPanelOpen) => set({ contactPanelOpen }),
  toggleContactPanel: () => set((s) => ({ contactPanelOpen: !s.contactPanelOpen })),
}));

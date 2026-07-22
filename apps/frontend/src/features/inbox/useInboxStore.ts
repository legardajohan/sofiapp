import { create } from 'zustand';

/** Estado de UI de la bandeja (no datos del servidor — eso vive en TanStack Query). */
interface InboxState {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Ficha del contacto (panel lateral, HU-OMNI-03). */
  contactPanelOpen: boolean;
  setContactPanelOpen: (open: boolean) => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  activeId: null,
  setActiveId: (activeId) => set({ activeId }),
  contactPanelOpen: false,
  setContactPanelOpen: (contactPanelOpen) => set({ contactPanelOpen }),
}));

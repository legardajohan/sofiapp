import { create } from 'zustand';

/** Estado de UI de la bandeja (no datos del servidor — eso vive en TanStack Query). */
interface InboxState {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  activeId: null,
  setActiveId: (activeId) => set({ activeId }),
}));

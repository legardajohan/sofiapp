import { create } from 'zustand';

interface AudioActivoState {
  /** Id del reproductor que está sonando, o `null`. */
  activo: string | null;
  setActivo: (id: string | null) => void;
}

/**
 * Un solo audio sonando a la vez en toda la bandeja (HU-OMNI-07), como en WhatsApp.
 *
 * Estado de UI puro, así que va en Zustand y no en TanStack Query. Cada reproductor se suscribe y
 * se pausa cuando el activo deja de ser él: sin esto, dar play a una segunda nota de voz las
 * superpondría.
 */
export const useAudioActivo = create<AudioActivoState>((set) => ({
  activo: null,
  setActivo: (activo) => set({ activo }),
}));

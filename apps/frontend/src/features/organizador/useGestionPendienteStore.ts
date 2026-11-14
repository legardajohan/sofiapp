import { create } from 'zustand';
import type { PendienteGestionable } from './types.js';

export type AccionPendiente = 'cerrar' | 'posponer';

interface GestionPendienteState {
  objetivo: PendienteGestionable | null;
  accion: AccionPendiente | null;
  abrir: (objetivo: PendienteGestionable, accion: AccionPendiente) => void;
  cerrarDialogo: () => void;
}

/**
 * Qué pendiente se está cerrando o posponiendo (estado de UI, no de servidor). Los modales viven
 * una sola vez en `AppLayout` y se abren desde cualquier sitio —pila, campana, Organizador, embudo—
 * sin pasar callbacks por medio árbol.
 */
export const useGestionPendienteStore = create<GestionPendienteState>((set) => ({
  objetivo: null,
  accion: null,
  abrir: (objetivo, accion) => set({ objetivo, accion }),
  cerrarDialogo: () => set({ objetivo: null, accion: null }),
}));

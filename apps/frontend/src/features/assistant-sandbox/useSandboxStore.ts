import { create } from 'zustand';
import type { EfectoRegistrado, SandboxEfecto } from './types.js';

interface SandboxState {
  /** Efectos recibidos por el socket en esta pestaña. No se persisten en el servidor. */
  efectos: EfectoRegistrado[];
  /** Hay una respuesta en camino (el admin escribió y aún no contesta Sofi ni el flujo). */
  esperandoRespuesta: boolean;
  registrarEfecto: (efecto: SandboxEfecto, at: string) => void;
  setEsperandoRespuesta: (valor: boolean) => void;
  limpiar: () => void;
}

let contador = 0;

export const useSandboxStore = create<SandboxState>((set) => ({
  efectos: [],
  esperandoRespuesta: false,
  registrarEfecto: (efecto, at) =>
    set((s) => {
      contador += 1;
      return { efectos: [...s.efectos, { key: `${at}-${contador}`, efecto, at }] };
    }),
  setEsperandoRespuesta: (valor) => set({ esperandoRespuesta: valor }),
  limpiar: () => set({ efectos: [], esperandoRespuesta: false }),
}));

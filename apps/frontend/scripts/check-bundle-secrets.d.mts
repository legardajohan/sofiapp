export interface Hallazgo {
  tipo: 'bundle' | 'variable';
  ubicacion: string;
  patron: string;
}

export const PATRONES_SECRETOS: readonly RegExp[];
export const NOMBRES_VITE_PROHIBIDOS: RegExp;

export function escanear(entrada: {
  dist: string;
  env: Record<string, string | undefined>;
}): Hallazgo[];

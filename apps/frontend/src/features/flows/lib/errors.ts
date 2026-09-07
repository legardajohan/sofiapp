import axios from 'axios';
import type { INodo, ValidationErrorResponse } from '../types.js';

/** Mensaje del backend si lo hay: dice más que un genérico. */
export function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

/**
 * Mapa `nodeId -> mensaje` a partir del detalle de Zod de un 400 (`validate.middleware.ts`), para
 * anclar cada fallo al nodo culpable (criterio 21) en vez de un toast genérico. `path` llega como
 * `"body.nodos.<índice>...".`; el índice se resuelve contra el array de nodos que se envió, en el
 * mismo orden. Los errores de nivel de flujo (p. ej. `entrada` inexistente, ids duplicados) no
 * mapean a ningún nodo y se descartan aquí — los cubre el toast.
 */
export function nodeErroresDesde(error: unknown, nodos: INodo[]): Record<string, string> {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return {};
  const body = error.response.data as Partial<ValidationErrorResponse> | undefined;
  const mapa: Record<string, string> = {};
  for (const { path, message } of body?.errors ?? []) {
    const match = /(?:^|\.)nodos\.(\d+)/.exec(path);
    const index = match ? Number(match[1]) : NaN;
    const nodo = Number.isInteger(index) ? nodos[index] : undefined;
    if (nodo && !mapa[nodo.id]) mapa[nodo.id] = message;
  }
  return mapa;
}

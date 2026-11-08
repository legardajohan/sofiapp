import axios from 'axios';
import type { ErrorGrafo } from '@sofiapp/shared';
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

/** Lo que el backend adjunta a un rechazo de guardado por errores del grafo (HU-FLOW-05). */
export interface DetalleGuardado {
  status: number | undefined;
  /** `FLOW_CON_ERRORES` (activar con errores) o `FLOW_ACTIVO_CON_ERRORES` (editar un flujo en producción). */
  codigo: string | undefined;
  errores: ErrorGrafo[];
  /** No hubo respuesta del servidor: se cayó la red, o el servidor no contestó. */
  sinRespuesta: boolean;
}

export function detalleDeGuardado(error: unknown): DetalleGuardado {
  if (!axios.isAxiosError(error)) {
    return { status: undefined, codigo: undefined, errores: [], sinRespuesta: false };
  }
  const data = error.response?.data as { codigo?: unknown; errores?: unknown } | undefined;
  return {
    status: error.response?.status,
    codigo: typeof data?.codigo === 'string' ? data.codigo : undefined,
    errores: Array.isArray(data?.errores) ? (data.errores as ErrorGrafo[]) : [],
    sinRespuesta: error.response === undefined,
  };
}

import { env } from '../../config/env.js';
import type { ITrmProvider, TrmFetchResult } from './trm-provider.interface.js';

// Provider real de la TRM oficial USD/COP: Superintendencia Financiera de Colombia publicada en
// datos.gov.co (recurso `32sa-8pi3`, SODA API). Devuelve la vigencia más reciente.
// Columnas del dataset: { valor, unidad, vigenciadesde, vigenciahasta }.

interface DatosGovTrmRow {
  valor?: unknown;
  vigenciadesde?: unknown;
}

/** Convierte la respuesta SODA en un `TrmFetchResult`. Puro (sin red): testeable con un payload. */
export function parseTrmDatosGov(payload: unknown): TrmFetchResult {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('Respuesta TRM vacía o con formato inesperado.');
  }
  const row = payload[0] as DatosGovTrmRow;
  if (typeof row.valor !== 'string' || typeof row.vigenciadesde !== 'string') {
    throw new Error('Respuesta TRM sin los campos valor/vigenciadesde esperados.');
  }
  const fechaVigencia = new Date(row.vigenciadesde);
  if (Number.isNaN(fechaVigencia.getTime())) {
    throw new Error('vigenciadesde inválida en la respuesta TRM.');
  }
  return {
    tasaCopPorUsd: row.valor,
    fechaVigencia,
    fuente: 'Superintendencia Financiera (datos.gov.co)',
  };
}

export const datosGovTrmProvider: ITrmProvider = {
  tipoFuente: 'SUPERFINANCIERA',
  fetchTrmVigente: async (): Promise<TrmFetchResult> => {
    const url = `${env.TRM_DATASET_URL}?$order=vigenciadesde%20DESC&$limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.TRM_HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`La fuente oficial de TRM respondió ${res.status}.`);
      const json: unknown = await res.json();
      return parseTrmDatosGov(json);
    } finally {
      clearTimeout(timeout);
    }
  },
};

import type { AiUsageMethod } from '../types.js';

export const METHOD_LABEL: Record<AiUsageMethod, string> = {
  chat: 'Chat',
  extract: 'Extracción',
  classify: 'Clasificación',
  summary: 'Resumen',
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

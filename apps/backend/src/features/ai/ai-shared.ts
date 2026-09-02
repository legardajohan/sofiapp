import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';

/**
 * Turnos escritos por el cliente. Los de rol `model` son de la empresa (bot o asesor) y no cuentan.
 *
 * Vive aquí y no dentro de un slice porque lo usan los dos servicios que el worker engancha al
 * final del ciclo de auto-reply —la semaforización (HU-IA-05) y la extracción (HU-IA-06)— para
 * decidir lo mismo: si la conversación tiene sustancia suficiente como para pagar una llamada al
 * modelo. Duplicarla haría que las dos guardas pudieran divergir sin que nadie se entere.
 */
export function turnosDelCliente(historial: ChatTurn[]): number {
  return historial.filter((t) => t.role === 'user').length;
}

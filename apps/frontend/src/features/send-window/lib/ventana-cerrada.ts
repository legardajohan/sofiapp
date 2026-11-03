import axios from 'axios';
import { cuandoAbre } from './formato.js';

/** Status con el que el backend bloquea un envío fuera de franja (HU-CONF-01). */
export const STATUS_VENTANA_CERRADA = 423;

/**
 * Si el error es el 423 de la ventana de envío, devuelve la siguiente apertura (`null` si no hay
 * una en el horizonte). Si es cualquier otro error, `undefined`.
 */
export function aperturaDeVentanaCerrada(error: unknown): string | null | undefined {
  if (!axios.isAxiosError(error) || error.response?.status !== STATUS_VENTANA_CERRADA) return undefined;
  const valor: unknown = (error.response.data as { siguienteApertura?: unknown } | undefined)?.siguienteApertura;
  return typeof valor === 'string' ? valor : null;
}

/** «Podrás enviar mañana a las 8:00.» — la misma frase en el banner, el toast y el diálogo. */
export function textoReapertura(apertura: string | null, zonaHoraria?: string): string {
  if (!apertura) return 'No hay un horario de envío abierto en las próximas dos semanas.';
  const zona = zonaHoraria ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Podrás enviar ${cuandoAbre(apertura, zona)}.`;
}

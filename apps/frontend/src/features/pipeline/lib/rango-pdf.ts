/**
 * Rango de fechas del reporte de pendientes (HU-PDF-01). Funciones puras: las usa el popover para
 * validar antes de pedir nada y para nombrar el archivo igual que el backend.
 */

export { aDiaCivil, zonaDelNavegador } from '@/lib/agenda';

/** Rango máximo que acepta el backend, en días con ambos extremos incluidos. */
export const RANGO_MAX_DIAS = 366;

const DIA_MS = 24 * 60 * 60 * 1000;

function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / DIA_MS) + 1;
}

/**
 * Por qué no se puede descargar todavía, o `null` si el rango es válido (CA6). Devolver el motivo
 * y no un booleano deja al popover decir exactamente qué falta.
 */
export function problemaConRango(desde: Date | undefined, hasta: Date | undefined): string | null {
  if (!desde && !hasta) return 'Elige la fecha inicial y la final.';
  if (!desde) return 'Falta la fecha inicial.';
  if (!hasta) return 'Falta la fecha final.';
  const dias = diasEntre(desde, hasta);
  if (dias < 1) return 'La fecha final no puede ser anterior a la inicial.';
  if (dias > RANGO_MAX_DIAS) return `El rango no puede superar ${RANGO_MAX_DIAS} días.`;
  return null;
}

/** Mismo nombre que pone el backend: `Pendientes_AAAA-MM-DD_a_AAAA-MM-DD.pdf`. */
export function nombreArchivoPendientes(desde: string, hasta: string): string {
  return `Pendientes_${desde}_a_${hasta}.pdf`;
}

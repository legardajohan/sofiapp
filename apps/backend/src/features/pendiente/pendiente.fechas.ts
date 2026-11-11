/**
 * Utilidades puras de fechas del reporte de pendientes (HU-PDF-01).
 *
 * El rango viaja como **días civiles** (`YYYY-MM-DD`) más la zona IANA del navegador, no como
 * instantes: así el nombre del archivo y el encabezado del PDF dicen exactamente las fechas que el
 * usuario eligió, y la conversión a instantes se hace aquí en un solo sitio. Sin dependencias: solo
 * `Intl`.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export function esZonaIana(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function partesDia(dia: string): [number, number, number] {
  const [y, m, d] = dia.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

/** ¿Es `YYYY-MM-DD` una fecha que existe? (`2026-02-30` no.) */
export function esDiaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const [y, m, d] = partesDia(dia);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/** Días civiles entre dos fechas, ambos extremos incluidos. Negativo si `hasta < desde`. */
export function diasEnRango(desde: string, hasta: string): number {
  const [y1, m1, d1] = partesDia(desde);
  const [y2, m2, d2] = partesDia(hasta);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DIA_MS) + 1;
}

/** Desfase (ms) de la zona respecto a UTC en un instante dado. */
function desfase(tz: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);
  const v = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const comoUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Instante de las 00:00 del día civil `y-m-d` en la zona `tz`. */
function medianoche(y: number, m: number, d: number, tz: string): Date {
  const supuesto = Date.UTC(y, m - 1, d);
  // Dos pasadas: la segunda corrige el caso en que el desfase cambia ese mismo día (horario de verano).
  const primera = supuesto - desfase(tz, new Date(supuesto));
  return new Date(supuesto - desfase(tz, new Date(primera)));
}

/**
 * HU-PDF-02 — hora a la que avisa un pendiente «de todo el día» (decisión de producto D1): ni a
 * medianoche, que despertaría a nadie, ni al final del día, cuando ya no da tiempo de atenderlo.
 */
export const HORA_AVISO_TODO_EL_DIA = '08:00';

/**
 * Instante (UTC) en que un reloj de la zona `tz` marca `hora` el día civil `dia`. Misma técnica
 * de dos pasadas que `medianoche`, que cubre los días con cambio de horario.
 */
export function instanteEnZona(dia: string, hora: string, tz: string): Date {
  const [y, m, d] = partesDia(dia);
  const [hh, mm] = hora.split(':').map(Number) as [number, number];
  const supuesto = Date.UTC(y, m - 1, d, hh, mm);
  const primera = supuesto - desfase(tz, new Date(supuesto));
  return new Date(supuesto - desfase(tz, new Date(primera)));
}

/** Instante del aviso de un pendiente (HU-PDF-02): sin hora, a las 08:00 de ese día (D1). */
export function instanteRecordatorio(dia: string, hora: string | null, tz: string): Date {
  return instanteEnZona(dia, hora ?? HORA_AVISO_TODO_EL_DIA, tz);
}

/**
 * `[inicio, fin)` en instantes: desde las 00:00 de `desde` hasta las 00:00 del día siguiente a
 * `hasta`, ambos en `tz`. El fin es exclusivo para no perder ni duplicar el último milisegundo.
 */
export function rangoDiasAInstantes(
  desde: string,
  hasta: string,
  tz: string,
): { inicio: Date; fin: Date } {
  const [y1, m1, d1] = partesDia(desde);
  const [y2, m2, d2] = partesDia(hasta);
  return { inicio: medianoche(y1, m1, d1, tz), fin: medianoche(y2, m2, d2 + 1, tz) };
}

/** El día civil de un instante en la zona `tz`, como `YYYY-MM-DD` (RN10: «hoy» de quien escribe). */
export function diaEnZona(instante: Date, tz: string): string {
  // `en-CA` formatea como `YYYY-MM-DD`, que es justo el formato del día civil.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** Mismo nombre que calcula el frontend: `Pendientes_AAAA-MM-DD_a_AAAA-MM-DD.pdf`. */
export function nombreArchivoPendientes(desde: string, hasta: string): string {
  return `Pendientes_${desde}_a_${hasta}.pdf`;
}

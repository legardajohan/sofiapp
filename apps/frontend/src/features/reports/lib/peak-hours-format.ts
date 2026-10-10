/** Formato de las etiquetas de horas y días de HU-REP-04. Los días llegan ya en la zona del reporte. */

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

/** `10` → `10:00`. */
export function formatHora(hora: number): string {
  return `${dosDigitos(hora)}:00`;
}

/** `10` → `10:00–11:00`. La franja completa: «a las 10» es ambiguo entre punto y hora entera. */
export function formatFranja(hora: number): string {
  return `${formatHora(hora)}–${formatHora((hora + 1) % 24)}`;
}

// `YYYY-MM-DD` es un día calendario, no un instante: se lee en UTC para no correrlo un día.
const diaCorto = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const diaLargo = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** `2026-09-22` → `22 sept`. */
export function formatDiaCorto(fecha: string): string {
  return diaCorto.format(new Date(`${fecha}T00:00:00Z`));
}

/** `2026-09-22` → `martes, 22 de septiembre`. */
export function formatDiaLargo(fecha: string): string {
  return diaLargo.format(new Date(`${fecha}T00:00:00Z`));
}

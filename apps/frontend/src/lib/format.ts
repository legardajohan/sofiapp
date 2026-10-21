/**
 * Formato numérico de reportes y tableros (es-CO). Compartido por HU-SAAS-03 y HU-REP-01.
 * Los formateadores se crean una vez: `Intl.NumberFormat` es caro de instanciar por celda.
 */

const entero = new Intl.NumberFormat('es-CO');
const porcentaje = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatEntero(n: number): string {
  return entero.format(n);
}

/** `0.159` → `15,9 %`. */
export function formatPorcentaje(fraccion: number): string {
  return porcentaje.format(fraccion);
}

const horaCorta = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });

/** Instante (ms o ISO) → `10:42 a. m.`, en la hora local del visor. */
export function formatHoraCorta(instante: number | string): string {
  return horaCorta.format(new Date(instante));
}

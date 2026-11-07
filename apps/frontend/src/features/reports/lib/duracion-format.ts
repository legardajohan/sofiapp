/**
 * Duraciones del tiempo activo (HU-REP-06). Los segundos llegan del backend; aquí solo se presentan.
 */

const entero = new Intl.NumberFormat('es-CO');

/** `45 000` → `12 h 30 min`; `2 700` → `45 min`; `20` → `menos de 1 min`; `0` → `0 min`. */
export function formatDuracion(segundos: number): string {
  if (segundos <= 0) return '0 min';
  const minutosTotales = Math.floor(segundos / 60);
  if (minutosTotales === 0) return 'menos de 1 min';
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  if (horas === 0) return `${minutos} min`;
  return minutos === 0 ? `${entero.format(horas)} h` : `${entero.format(horas)} h ${minutos} min`;
}

/** `45 000` → `12:30` (horas:minutos). Para columnas y tooltips donde todo debe alinear. */
export function formatHorasMinutos(segundos: number): string {
  const minutosTotales = Math.max(0, Math.floor(segundos / 60));
  const horas = Math.floor(minutosTotales / 60);
  return `${entero.format(horas)}:${String(minutosTotales % 60).padStart(2, '0')}`;
}

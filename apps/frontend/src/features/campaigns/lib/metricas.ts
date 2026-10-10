import type { CampaignDetalleDTO, EstadoCampana } from '../types.js';

const FORMATO_TASA = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  maximumFractionDigits: 1,
});

/** `0.4231` → «42,3 %». Sin base para calcularla, una raya: un 0 % diría algo que no pasó. */
export function formatearTasa(tasa: number | null): string {
  return tasa === null ? '—' : FORMATO_TASA.format(tasa);
}

/**
 * Desde cuándo se miden lecturas, respuestas y conversiones (despliegue de HU-MARK-04). Una campaña
 * que salió antes las tiene en cero porque nadie las registró, no porque no ocurrieran.
 */
export const INICIO_MEDICION = new Date('2026-10-10T00:00:00-05:00');

export function esAnteriorALaMedicion(campana: Pick<CampaignDetalleDTO, 'iniciadaAt'>): boolean {
  return campana.iniciadaAt !== null && new Date(campana.iniciadaAt) < INICIO_MEDICION;
}

/** Estados en los que todavía no salió ningún mensaje: no hay resultados que mostrar. */
const SIN_ENVIOS: readonly EstadoCampana[] = ['borrador', 'programada'];

export function tieneResultados(estado: EstadoCampana): boolean {
  return !SIN_ENVIOS.includes(estado);
}

const MS_DIA = 86_400_000;

/**
 * Si los resultados pueden seguir moviéndose. Mientras envía, obviamente; y después, durante la
 * ventana de conversión, porque las respuestas y las ventas llegan días más tarde.
 */
export function resultadosVivos(
  campana: Pick<CampaignDetalleDTO, 'estado' | 'iniciadaAt'>,
  conversionDias: number,
): boolean {
  if (campana.estado === 'en_curso' || campana.estado === 'pausada') return true;
  if (!campana.iniciadaAt) return false;
  return Date.now() - new Date(campana.iniciadaAt).getTime() < (conversionDias + 1) * MS_DIA;
}

/** `'2026-10-03'` → la fecha local de ese día, sin pasar por UTC (que la correría un día atrás). */
function fechaDeDia(dia: string): Date {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(anio ?? 1970, (mes ?? 1) - 1, d ?? 1);
}

/** «3 oct» — para los ejes, donde cabe poco. */
export function formatearDiaCorto(dia: string): string {
  return fechaDeDia(dia).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

/** «viernes, 3 de octubre» — para el tooltip, donde importa el día de la semana. */
export function formatearDiaLargo(dia: string): string {
  return fechaDeDia(dia).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

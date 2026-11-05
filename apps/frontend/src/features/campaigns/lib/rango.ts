import { TAG_NOMBRE_MAX } from '@/features/tags/types';
import type { AudienciaCampanaDTO, AudienciaRecienteInput, RangoAudiencia } from '../types.js';

/**
 * Lo puro de la audiencia por mensajes recientes (HU-MARK-07): textos, la sugerencia de etiqueta y
 * los límites del calendario. Las fechas **exactas** las resuelve siempre el servidor, en la zona del
 * tenant; aquí solo se construye la petición y se formatea lo que vuelve.
 */

/** Tope del rango personalizado. Espejo de `CAMPAIGN_AUDIENCE_MAX_DAYS` del backend (default). */
export const MAX_DIAS_RANGO = 90;

export const ETIQUETA_RANGO: Record<RangoAudiencia, string> = {
  '1d': 'Último día',
  '3d': '3 días',
  '7d': '7 días',
  custom: 'Personalizado',
};

/** Frase para el resumen: "a quienes les escribiste en las últimas 72 horas". */
export const DESCRIPCION_RANGO: Record<Exclude<RangoAudiencia, 'custom'>, string> = {
  '1d': 'las últimas 24 horas',
  '3d': 'los últimos 3 días',
  '7d': 'los últimos 7 días',
};

/** `YYYY-MM-DD` del día local de `fecha` (el del calendario que ve la persona). */
export function aYmd(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

/** Días entre dos fechas de calendario, ambos incluidos. */
export function diasInclusivos(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / 86_400_000) + 1;
}

export interface SeleccionRango {
  rango: RangoAudiencia;
  desde?: Date | undefined;
  hasta?: Date | undefined;
}

/**
 * De la selección de la UI a la petición. `null` mientras el personalizado esté a medias: preguntar
 * al servidor por un rango sin fin solo produciría un 400.
 */
export function aAudiencia(sel: SeleccionRango): AudienciaRecienteInput | null {
  if (sel.rango !== 'custom') return { tipo: 'mensajes_recientes', rango: sel.rango };
  if (!sel.desde || !sel.hasta) return null;
  return { tipo: 'mensajes_recientes', rango: 'custom', desde: aYmd(sel.desde), hasta: aYmd(sel.hasta) };
}

/** `dd/mm/aaaa`, el formato que lee cualquiera en la región. */
export function fechaCorta(fecha: Date): string {
  const d = String(fecha.getDate()).padStart(2, '0');
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${fecha.getFullYear()}`;
}

/**
 * Nombre sugerido para la etiqueta: «Campaña {nombre} - {dd/mm/aaaa}». Si no cabe en el tope, se
 * recorta el **nombre** y no la fecha: la fecha es lo que distingue una campaña de la siguiente.
 */
export function sugerirNombreEtiqueta(nombreCampana: string, fecha: Date): string {
  const sufijo = ` - ${fechaCorta(fecha)}`;
  const prefijo = 'Campaña ';
  const nombre = nombreCampana.trim().replace(/\s+/g, ' ') || 'sin nombre';
  const espacio = TAG_NOMBRE_MAX - prefijo.length - sufijo.length;
  const recortado = nombre.length > espacio ? `${nombre.slice(0, espacio - 1).trimEnd()}…` : nombre;
  return `${prefijo}${recortado}${sufijo}`;
}

/** «28 oct, 08:14» en la zona dada. */
function instante(iso: string, zona: string): string {
  return new Intl.DateTimeFormat('es', {
    timeZone: zona,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** «Del 28 oct, 08:14 al 31 oct, 08:14» — el rango resuelto, siempre en la zona del tenant. */
export function formatearRangoResuelto(desde: string, hasta: string, zona: string): string {
  return `Del ${instante(desde, zona)} al ${instante(hasta, zona)}`;
}

/** Frase del filtro aplicado para el detalle de una campaña. */
export function describirAudiencia(a: AudienciaCampanaDTO): string {
  if (a.tipo === 'segmento') return 'Por filtros de contacto';
  if (a.rango && a.rango !== 'custom') return `Mensajes enviados en ${DESCRIPCION_RANGO[a.rango]}`;
  return 'Mensajes enviados en un rango personalizado';
}

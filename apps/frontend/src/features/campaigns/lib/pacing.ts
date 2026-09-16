import type {
  EstadoCampana,
  EstadoDestinatario,
  MessagingTier,
  QualityRating,
} from '../types.js';

/**
 * Cuántos destinatarios por día declara cada tier de Meta. Espejo de la tabla del backend, y solo
 * para **mostrar** el número junto al nombre del tier: la decisión de cuánto se envía la toma el
 * servidor, aquí no se recalcula nada.
 */
const DESTINATARIOS_POR_TIER: Record<MessagingTier, string> = {
  TIER_50: '50',
  TIER_250: '250',
  TIER_1K: '1.000',
  TIER_10K: '10.000',
  TIER_100K: '100.000',
  TIER_UNLIMITED: 'sin límite',
};

/** Nombre del tier en lenguaje de persona, no en el del proveedor. */
export function etiquetaTier(tier: MessagingTier): string {
  return `${DESTINATARIOS_POR_TIER[tier]} al día`;
}

export const ETIQUETA_CALIDAD: Record<QualityRating, string> = {
  GREEN: 'Calidad alta',
  YELLOW: 'Calidad media',
  RED: 'Calidad baja',
  UNKNOWN: 'Calidad sin confirmar',
};

export const ETIQUETA_ESTADO: Record<EstadoCampana, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_curso: 'Enviando',
  pausada: 'En pausa',
  completada: 'Completada',
  cancelada: 'Cancelada',
  fallida: 'Fallida',
};

export const ETIQUETA_DESTINATARIO: Record<EstadoDestinatario, string> = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  entregado: 'Entregado',
  fallido: 'Fallido',
  omitido: 'Omitido',
};

/** Cuántos días tardará la campaña al ritmo del cupo actual. Solo informativo. */
export function diasEstimados(destinatarios: number, limiteDiario: number): number {
  if (limiteDiario <= 0) return 0;
  return Math.ceil(destinatarios / limiteDiario);
}

/** «1.240» en vez de «1240»: son cifras que el administrador va a leer en voz alta. */
export function formatearNumero(n: number): string {
  return n.toLocaleString('es-CO');
}

/**
 * Cuánto tardará la campaña, dicho como lo diría una persona.
 *
 * Sin cupo no se inventa un plazo: decir «0 días» cuando el número está bloqueado sería mentir con
 * una cifra, y lo que hay que comunicar es que hoy no sale.
 */
export function plazoLegible(destinatarios: number, limiteDiario: number): string {
  const dias = diasEstimados(destinatarios, limiteDiario);
  if (dias === 0) return 'sin cupo disponible';
  if (dias === 1) return 'se envía hoy';
  return `tardará unos ${dias} días`;
}

/** Porcentaje enviado (o fallido) sobre el total. `0` cuando todavía no hay destinatarios. */
export function porcentaje(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((parte / total) * 100));
}

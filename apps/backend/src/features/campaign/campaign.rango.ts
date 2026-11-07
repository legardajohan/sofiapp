import { AppError } from '../../utils/AppError.js';
import {
  diasInclusivos,
  fechaLocal,
  finDelDiaEnZona,
  inicioDelDiaEnZona,
} from '../../utils/zona-horaria.util.js';

/**
 * Rangos de la audiencia "mensajes recientes" (HU-MARK-07). **Módulo puro**: sin Mongo, sin red,
 * sin reloj propio — `ahora` y la zona llegan como argumento, así que se prueba sin base de datos.
 */
export const RANGOS_AUDIENCIA = ['1d', '3d', '7d', 'custom'] as const;
export type RangoAudiencia = (typeof RANGOS_AUDIENCIA)[number];
export type RangoPreset = Exclude<RangoAudiencia, 'custom'>;

/**
 * Los presets son ventanas **rodantes**: "último día" es literalmente 24 h hacia atrás. Con días de
 * calendario, el "último día" consultado a las 08:00 cubriría solo ocho horas.
 */
export const HORAS_POR_RANGO: Readonly<Record<RangoPreset, number>> = {
  '1d': 24,
  '3d': 72,
  '7d': 168,
};

export interface EntradaRango {
  rango: RangoAudiencia;
  /** `YYYY-MM-DD`, solo en `custom`. Día de calendario EN LA ZONA del tenant. */
  desde?: string;
  hasta?: string;
}

export interface RangoResuelto {
  desde: Date;
  hasta: Date;
}

const HORA_MS = 3_600_000;

/**
 * Convierte la elección del usuario en dos instantes exactos.
 *
 * - Preset: `[ahora − horas, ahora]`.
 * - `custom`: de las 00:00:00.000 de `desde` a las 23:59:59.999 de `hasta`, ambos **en `zona`**, con
 *   el final recortado a `ahora` (el día de hoy aún no terminó).
 *
 * La **forma** de las fechas la valida Zod; lo que necesita la zona del tenant (¿es futura? ¿cuántos
 * días son?) se valida aquí, porque Zod no la conoce. Cada caso es un `400` con un motivo legible.
 */
export function resolverRangoAudiencia(
  entrada: EntradaRango,
  zona: string,
  ahora: Date,
  maxDias: number,
): RangoResuelto {
  if (entrada.rango !== 'custom') {
    return {
      desde: new Date(ahora.getTime() - HORAS_POR_RANGO[entrada.rango] * HORA_MS),
      hasta: new Date(ahora.getTime()),
    };
  }

  const { desde, hasta } = entrada;
  if (!desde || !hasta) {
    throw new AppError('El rango personalizado necesita fecha de inicio y de fin.', 400);
  }
  if (desde > hasta) {
    throw new AppError('La fecha de inicio no puede ser posterior a la de fin.', 400);
  }
  if (hasta > fechaLocal(ahora, zona)) {
    throw new AppError('No se permiten fechas futuras en el rango.', 400);
  }
  if (diasInclusivos(desde, hasta) > maxDias) {
    throw new AppError(`El rango máximo es de ${maxDias} días.`, 400);
  }

  const fin = finDelDiaEnZona(hasta, zona);
  return {
    desde: inicioDelDiaEnZona(desde, zona),
    hasta: fin.getTime() > ahora.getTime() ? new Date(ahora.getTime()) : fin,
  };
}

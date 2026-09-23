import { AppError } from '../../utils/AppError.js';
import type { MessagingTier, QualityRating } from '../channel/channel.types.js';
import type { IPresupuestoResponse } from './campaign.types.js';

const MS_POR_DIA = 86_400_000;

/**
 * Destinatarios únicos que Meta permite abrir en 24 h rodantes por tier.
 *
 * `TIER_UNLIMITED` no es infinito en la práctica: el techo pasa a ser el rendimiento de la Graph
 * API (~80 msg/s), que gobierna el `limiter` de BullMQ, no esta tabla. Se modela con un número
 * grande y finito para que las divisiones de más abajo no produzcan `Infinity` ni `NaN`.
 */
export const LIMITE_POR_TIER: Record<MessagingTier, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: 1_000_000,
};

/**
 * Cuánto del tier se considera gastable según la calidad del número.
 *
 * `RED` vale 0 porque **bloquea**, no reduce: ver `assertPuedeLanzar`. Un número en rojo está a un
 * paso de la suspensión, y el remedio no es enviar más despacio sino no enviar.
 *
 * `UNKNOWN` se trata como `YELLOW` a propósito: no haber podido sondear a Meta no es motivo para
 * enviar como si el número estuviera perfecto.
 */
export const FACTOR_POR_CALIDAD: Record<QualityRating, number> = {
  GREEN: 1,
  YELLOW: 0.5,
  RED: 0,
  UNKNOWN: 0.5,
};

export interface CalcularPresupuestoInput {
  tier: MessagingTier;
  calidad: QualityRating;
  /** Destinatarios únicos de plantilla ya abiertos en las últimas 24 h rodantes. */
  consumido24h: number;
  /** Fracción del tier que la plataforma se permite gastar (`CAMPAIGN_SAFETY_MARGIN`). */
  margen: number;
  intervaloMinimoMs: number;
}

/**
 * Presupuesto de envío del día. **Función pura**: ni Mongo ni red, para poder probar la aritmética
 * del pacing sin levantar nada.
 *
 * `limiteDiario` es el techo tras margen y calidad; `disponible` es lo que queda de verdad tras
 * descontar lo ya gastado — y lo ya gastado incluye los recordatorios de HU-FLOW-02 y los envíos
 * manuales de plantilla, porque salen del mismo número.
 */
export function calcularPresupuesto(input: CalcularPresupuestoInput): IPresupuestoResponse {
  const { tier, calidad, consumido24h, margen, intervaloMinimoMs } = input;

  const limiteDiario = Math.floor(LIMITE_POR_TIER[tier] * margen * FACTOR_POR_CALIDAD[calidad]);
  const disponible = Math.max(limiteDiario - consumido24h, 0);

  // Repartir el cupo del día a lo largo del día. Con `limiteDiario` a 0 la división no se llega a
  // hacer: el intervalo es irrelevante porque no se va a enviar nada.
  const intervaloMs =
    limiteDiario > 0
      ? Math.max(intervaloMinimoMs, Math.floor(MS_POR_DIA / limiteDiario))
      : intervaloMinimoMs;

  const bloqueado = calidad === 'RED' || disponible <= 0;
  let motivoBloqueo: string | null = null;
  if (calidad === 'RED') {
    motivoBloqueo =
      'La calidad del número de WhatsApp está en rojo. Enviar ahora arriesga la suspensión de la cuenta.';
  } else if (disponible <= 0) {
    motivoBloqueo =
      'El número ya agotó su cupo de conversaciones iniciadas de las últimas 24 h. Vuelve a intentarlo más tarde.';
  }

  return {
    tier,
    calidad,
    limiteDiario,
    consumido24h,
    disponible,
    intervaloMs,
    bloqueado,
    motivoBloqueo,
  };
}

/**
 * Puerta del lanzamiento. `409` y no `422`: el cuerpo de la petición es correcto, lo que pasa es
 * que el **estado del número** no admite la operación ahora mismo.
 */
export function assertPuedeLanzar(presupuesto: IPresupuestoResponse): void {
  if (presupuesto.bloqueado) {
    throw new AppError(presupuesto.motivoBloqueo ?? 'No se puede enviar en este momento.', 409, {
      tier: presupuesto.tier,
      calidad: presupuesto.calidad,
      disponible: presupuesto.disponible,
    });
  }
}

/**
 * Cuántos días tardará la campaña con el cupo actual. Solo informativo (el wizard lo muestra en el
 * paso de revisión); nunca decide nada.
 */
export function diasEstimados(destinatarios: number, limiteDiario: number): number {
  if (limiteDiario <= 0) return 0;
  return Math.ceil(destinatarios / limiteDiario);
}

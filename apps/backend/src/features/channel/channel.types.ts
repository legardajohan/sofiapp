import { Document, Types } from 'mongoose';

/**
 * Tiers de mensajería de Meta (HU-MARK-01): cuántos **destinatarios únicos** puede abrir el número
 * en 24 h rodantes con conversaciones iniciadas por la empresa. No es un límite de mensajes: dos
 * plantillas al mismo contacto el mismo día cuentan una vez.
 *
 * `TIER_250` es el de un número sin verificar, y por eso es el valor por defecto: suponer más sería
 * suponer a favor y acabar chocando con el límite real.
 */
export const MESSAGING_TIERS = [
  'TIER_50',
  'TIER_250',
  'TIER_1K',
  'TIER_10K',
  'TIER_100K',
  'TIER_UNLIMITED',
] as const;
export type MessagingTier = (typeof MESSAGING_TIERS)[number];

/**
 * Calificación de calidad del número. `UNKNOWN` no es "sin dato irrelevante": se trata como
 * `YELLOW` al calcular el presupuesto, porque no saber cómo está el número no es motivo para
 * enviar como si estuviera perfecto.
 */
export const QUALITY_RATINGS = ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'] as const;
export type QualityRating = (typeof QUALITY_RATINGS)[number];

/** `health_status.can_send_message` de la Graph API. */
export const HEALTH_STATUSES = ['AVAILABLE', 'LIMITED', 'BLOCKED', 'UNKNOWN'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export interface IMetaIntegration {
  tenantId: Types.ObjectId;
  canal: 'whatsapp';
  wabaId: string;
  phoneNumberId: string;
  accessTokenEnc: string;
  activo: boolean;
  // ─── Capacidad de envío del número (HU-MARK-01) ────────────────────────────
  messagingTier: MessagingTier;
  qualityRating: QualityRating;
  healthStatus: HealthStatus;
  /** Cuándo se sondeó por última vez. `null` = nunca; los valores son entonces los de defecto. */
  tierSyncedAt: Date | null;
  /**
   * `true` = lo fijó una persona y la sonda **no lo pisa**. Existe porque la Graph API devuelve
   * `403` en varios escenarios legítimos (token de dashboard caducado, número sandbox), y en esos
   * casos el administrador tiene que poder declarar el tier real para que la campaña no vaya a
   * ciegas con el valor conservador.
   */
  tierManual: boolean;
}

export interface IMetaIntegrationDocument extends IMetaIntegration, Document {}

export interface IChannelConnectDto {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

export interface IChannelStatusResponse {
  activo: boolean;
  phoneNumberId: string;
  wabaId: string;
  messagingTier: MessagingTier;
  qualityRating: QualityRating;
  healthStatus: HealthStatus;
  tierSyncedAt: string | null;
  tierManual: boolean;
}

/** Override manual del tier desde el panel del canal. */
export interface IUpdateChannelTierDto {
  messagingTier?: MessagingTier;
  qualityRating?: QualityRating;
}

import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type {
  HealthStatus,
  MessagingTier,
  QualityRating,
} from '../../features/channel/channel.types.js';
import {
  HEALTH_STATUSES,
  MESSAGING_TIERS,
  QUALITY_RATINGS,
} from '../../features/channel/channel.types.js';

/**
 * Sonda de salud del número de WhatsApp (HU-MARK-01).
 *
 * Es la misma llamada que `docs/integrations/meta-whatsapp.md` §8 documentaba **solo para
 * diagnosticar a mano** un `403 (#131005)`. HU-MARK-01 la promueve a uso en caliente: el tier y la
 * calidad son lo que gobierna la cadencia de una campaña, y consultarlos con `curl` cuando algo ya
 * falló llega tarde.
 */
export interface IPhoneNumberHealth {
  messagingTier: MessagingTier;
  qualityRating: QualityRating;
  healthStatus: HealthStatus;
}

export interface IMetaPhoneNumberClient {
  /** `null` si Meta no responde o responde algo ilegible: **nunca lanza**. Ver `syncChannelTier`. */
  getHealth(phoneNumberId: string, accessToken: string): Promise<IPhoneNumberHealth | null>;
}

interface IGraphPhoneNumber {
  quality_rating?: string;
  messaging_limit_tier?: string;
  health_status?: { can_send_message?: string };
}

/**
 * Normaliza contra la unión conocida en vez de castear.
 *
 * Meta añade tiers nuevos sin avisar (`TIER_50` apareció después que el resto), y un valor
 * desconocido colado en el documento rompería el `enum` del schema al guardar. Cayendo al valor
 * conservador se pierde capacidad de envío, que es el lado seguro del error: lo contrario sería
 * enviar de más contra un límite que no conocemos.
 */
function normalizar<T extends string>(valor: string | undefined, validos: readonly T[], porDefecto: T): T {
  return validos.includes(valor as T) ? (valor as T) : porDefecto;
}

export const metaPhoneNumberClient: IMetaPhoneNumberClient = {
  async getHealth(phoneNumberId, accessToken) {
    const campos = 'health_status,quality_rating,messaging_limit_tier';
    const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${phoneNumberId}?fields=${campos}`;

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (!res.ok) {
        logger.warn('No se pudo sondear la salud del número de WhatsApp', {
          phoneNumberId,
          status: res.status,
        });
        return null;
      }

      const data = (await res.json()) as IGraphPhoneNumber;

      return {
        // 'TIER_250' es el techo de un número sin verificar: el suelo razonable si Meta calla.
        messagingTier: normalizar(data.messaging_limit_tier, MESSAGING_TIERS, 'TIER_250'),
        qualityRating: normalizar(data.quality_rating, QUALITY_RATINGS, 'UNKNOWN'),
        healthStatus: normalizar(data.health_status?.can_send_message, HEALTH_STATUSES, 'UNKNOWN'),
      };
    } catch (err) {
      // No se propaga: que la Graph API esté caída no puede impedir lanzar una campaña con el
      // último tier conocido. Ver criterio 7 del spec.
      logger.warn('Fallo de red al sondear la salud del número de WhatsApp', {
        phoneNumberId,
        error: String(err),
      });
      return null;
    }
  },
};

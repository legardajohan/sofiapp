import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

/**
 * Llamadas a la Graph API que convierten el resultado del Embedded Signup en un canal operativo
 * (HT-WA-03): canje del `code`, suscripción de la app a la WABA y registro del número en la Cloud
 * API.
 *
 * A diferencia de la sonda de salud, aquí un fallo **sí** se lanza: cada paso es necesario para que
 * el número funcione, y el service decide qué contar a la persona. Por eso los errores de Meta se
 * traducen aquí mismo a `AppError` con texto humano: el código crudo de Meta va al log, no a la UI.
 */
export interface IPhoneNumberInfo {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

export interface IMetaOnboardingClient {
  /** Canjea el `code` de un solo uso del popup por el token de negocio del tenant. */
  exchangeCode(code: string): Promise<string>;
  /** Sin esto Meta no envía al webhook los mensajes del número. */
  subscribeApp(wabaId: string, accessToken: string): Promise<void>;
  /** Habilita el número en la Cloud API con el PIN de verificación en dos pasos. */
  registerPhone(phoneNumberId: string, accessToken: string, pin: string): Promise<void>;
  /** `null` si Meta no responde: es un dato cosmético y **nunca lanza**. */
  getPhoneInfo(phoneNumberId: string, accessToken: string): Promise<IPhoneNumberInfo | null>;
}

interface IGraphError {
  error?: { message?: string; code?: number; error_subcode?: number };
}

/** El número ya tiene verificación en dos pasos con un PIN distinto del que enviamos. */
const PIN_MISMATCH = 133005;
/** Demasiados intentos de PIN: Meta bloquea temporalmente el registro. */
const PIN_ATTEMPTS_EXCEEDED = new Set([133008, 133009]);

/** Motivo accionable del 422, para que la UI abra el diálogo del PIN en vez de mostrar un error. */
export const PIN_REQUIRED_REASON = 'pin_required';

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${path}`;
}

async function readGraphError(res: Response): Promise<IGraphError['error']> {
  try {
    const body = (await res.json()) as IGraphError;
    return body.error;
  } catch {
    return undefined;
  }
}

function metaUnavailable(): AppError {
  return new AppError(
    'Meta no respondió como esperábamos. Inténtalo de nuevo en unos minutos.',
    502,
  );
}

async function postGraph(
  path: string,
  accessToken: string,
  body: Record<string, unknown> | undefined,
  paso: string,
): Promise<void> {
  const res = await fetch(graphUrl(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.ok) return;

  const error = await readGraphError(res);
  logger.warn(`Embedded Signup: falló ${paso}`, {
    status: res.status,
    code: error?.code,
    subcode: error?.error_subcode,
    message: error?.message,
  });

  if (error?.code === PIN_MISMATCH) {
    throw new AppError(
      'Este número ya tiene verificación en dos pasos. Ingresa su PIN de 6 dígitos para terminar.',
      422,
      { reason: PIN_REQUIRED_REASON },
    );
  }
  if (error?.code !== undefined && PIN_ATTEMPTS_EXCEEDED.has(error.code)) {
    throw new AppError(
      'Meta bloqueó temporalmente los intentos de PIN de este número. Espera unas horas e inténtalo de nuevo.',
      429,
    );
  }
  throw metaUnavailable();
}

export const metaOnboardingClient: IMetaOnboardingClient = {
  async exchangeCode(code) {
    if (!env.META_APP_ID || !env.META_APP_SECRET) {
      throw new AppError('La conexión con Facebook no está configurada en este servidor.', 503);
    }

    const params = new URLSearchParams({
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      code,
    });
    const res = await fetch(`${graphUrl('oauth/access_token')}?${params.toString()}`);

    if (!res.ok) {
      const error = await readGraphError(res);
      logger.warn('Embedded Signup: no se pudo canjear el code', {
        status: res.status,
        code: error?.code,
        message: error?.message,
      });
      // Un 4xx aquí es casi siempre el code caducado (dura ~30 s) o ya usado: la salida es repetir.
      if (res.status >= 400 && res.status < 500) {
        throw new AppError(
          'La autorización de Facebook caducó antes de completarse. Vuelve a conectar.',
          400,
        );
      }
      throw metaUnavailable();
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw metaUnavailable();
    return data.access_token;
  },

  async subscribeApp(wabaId, accessToken) {
    await postGraph(`${wabaId}/subscribed_apps`, accessToken, undefined, 'la suscripción a la WABA');
  },

  async registerPhone(phoneNumberId, accessToken, pin) {
    await postGraph(
      `${phoneNumberId}/register`,
      accessToken,
      { messaging_product: 'whatsapp', pin },
      'el registro del número',
    );
  },

  async getPhoneInfo(phoneNumberId, accessToken) {
    try {
      const res = await fetch(`${graphUrl(phoneNumberId)}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;

      const data = (await res.json()) as { display_phone_number?: string; verified_name?: string };
      return {
        displayPhoneNumber: data.display_phone_number ?? null,
        verifiedName: data.verified_name ?? null,
      };
    } catch (err) {
      logger.warn('No se pudo leer el número de WhatsApp', { phoneNumberId, error: String(err) });
      return null;
    }
  },
};

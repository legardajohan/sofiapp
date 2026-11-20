import { z } from 'zod';
import { esReferenciaValida } from '../../features/billing/payment.reference.js';
import { AppError } from '../../utils/AppError.js';
import type {
  CrearIntentoParams,
  DatosCheckout,
  IPaymentProvider,
  TokensAceptacion,
  TransaccionProveedor,
} from './payment-provider.interface.js';
import { mapearEstadoWompi } from './wompi.estado.js';
import { verificarEventoWompi } from './wompi.event.js';
import { createWompiHttpClient, type WompiHttpDeps } from './wompi.http.client.js';
import { firmarIntegridad } from './wompi.signature.js';

export interface WompiConfig {
  env: 'sandbox' | 'production';
  publicKey: string;
  privateKey: string;
  eventsSecret: string;
  integritySecret: string;
  redirectUrl: string;
  timeoutMs: number;
}

export const WOMPI_BASE_URL = {
  sandbox: 'https://sandbox.wompi.co/v1',
  production: 'https://production.wompi.co/v1',
} as const;

const MIN_EXPIRACION_MS = 60_000;
const MAX_EXPIRACION_MS = 24 * 60 * 60 * 1000;

const TokenSchema = z.object({ acceptance_token: z.string().min(1), permalink: z.string().min(1) });
const MerchantSchema = z.object({
  data: z.object({
    presigned_acceptance: TokenSchema,
    presigned_personal_data_auth: TokenSchema,
  }),
});

const TransaccionSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount_in_cents: z.number().int(),
  currency: z.string(),
  reference: z.string(),
  payment_method_type: z.string().nullish(),
  status_message: z.string().nullish(),
  created_at: z.string().optional(),
});
type TransaccionWompi = z.infer<typeof TransaccionSchema>;

const UnaTransaccionSchema = z.object({ data: TransaccionSchema });
const ListaTransaccionesSchema = z.object({ data: z.array(TransaccionSchema) });

function aTransaccion(t: TransaccionWompi): TransaccionProveedor {
  return {
    id: t.id,
    reference: t.reference,
    estado: mapearEstadoWompi(t.status),
    estadoProveedor: t.status,
    amountInCents: t.amount_in_cents,
    currency: t.currency,
    metodo: t.payment_method_type ?? null,
    detalle: t.status_message ?? null,
  };
}

const respuestaInesperada = (): AppError =>
  new AppError('La pasarela de pagos respondió con un formato inesperado', 502);

function validarIntento(p: CrearIntentoParams, ahora: number): void {
  if (!esReferenciaValida(p.reference)) throw new AppError('Referencia de pago inválida', 400);
  if (!Number.isSafeInteger(p.amountInCents) || p.amountInCents < 1) {
    throw new AppError('Monto inválido', 400);
  }
  const diff = p.expiraEn.getTime() - ahora;
  if (Number.isNaN(diff) || diff < MIN_EXPIRACION_MS || diff > MAX_EXPIRACION_MS) {
    throw new AppError('La caducidad del pago debe estar entre 1 minuto y 24 horas', 400);
  }
}

export function createWompiProvider(cfg: WompiConfig, deps: WompiHttpDeps = {}): IPaymentProvider {
  const http = createWompiHttpClient(
    { baseUrl: WOMPI_BASE_URL[cfg.env], timeoutMs: cfg.timeoutMs },
    deps,
  );
  const authPrivada = { Authorization: `Bearer ${cfg.privateKey}` };

  return {
    nombre: 'wompi',

    crearIntento(p): Promise<DatosCheckout> {
      try {
        validarIntento(p, Date.now());
      } catch (e) {
        return Promise.reject(e);
      }
      const expirationTime = p.expiraEn.toISOString();
      return Promise.resolve({
        publicKey: cfg.publicKey,
        currency: 'COP',
        amountInCents: p.amountInCents,
        reference: p.reference,
        expirationTime,
        signatureIntegrity: firmarIntegridad({
          reference: p.reference,
          amountInCents: p.amountInCents,
          currency: 'COP',
          expirationTime,
          integritySecret: cfg.integritySecret,
        }),
        redirectUrl: cfg.redirectUrl,
      });
    },

    async obtenerTokensAceptacion(): Promise<TokensAceptacion> {
      const json = await http.get('/merchants/info', {
        headers: { 'x-merchant-public-key': cfg.publicKey },
      });
      const parsed = MerchantSchema.safeParse(json);
      if (!parsed.success) throw respuestaInesperada();
      const { presigned_acceptance: a, presigned_personal_data_auth: d } = parsed.data.data;
      return {
        aceptacion: { token: a.acceptance_token, urlTerminos: a.permalink },
        datosPersonales: { token: d.acceptance_token, urlPolitica: d.permalink },
      };
    },

    async consultarTransaccion(id): Promise<TransaccionProveedor> {
      const json = await http.get(`/transactions/${encodeURIComponent(id)}`, {
        headers: authPrivada,
      });
      const parsed = UnaTransaccionSchema.safeParse(json);
      if (!parsed.success) throw respuestaInesperada();
      return aTransaccion(parsed.data.data);
    },

    async buscarPorReferencia(reference): Promise<TransaccionProveedor | null> {
      if (!esReferenciaValida(reference)) throw new AppError('Referencia de pago inválida', 400);
      let json: unknown;
      try {
        json = await http.get(`/transactions?reference=${reference}`, { headers: authPrivada });
      } catch (e) {
        if (e instanceof AppError && e.statusCode === 404) return null;
        throw e;
      }
      const parsed = ListaTransaccionesSchema.safeParse(json);
      if (!parsed.success) throw respuestaInesperada();
      const masReciente = [...parsed.data.data].sort((x, y) =>
        (y.created_at ?? '').localeCompare(x.created_at ?? ''),
      )[0];
      return masReciente ? aTransaccion(masReciente) : null;
    },

    verificarEvento(body, checksumCabecera) {
      return verificarEventoWompi(body, checksumCabecera, cfg.eventsSecret);
    },
  };
}

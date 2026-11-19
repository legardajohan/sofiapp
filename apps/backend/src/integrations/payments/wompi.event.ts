import { z } from 'zod';
import type { ResultadoVerificacion } from './payment-provider.interface.js';
import { mapearEstadoWompi } from './wompi.estado.js';
import { calcularChecksumEvento, checksumsIguales } from './wompi.signature.js';

const EventoWompiSchema = z.object({
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  environment: z.enum(['test', 'prod']),
  timestamp: z.number().int(),
  signature: z.object({
    properties: z.array(z.string()).min(1),
    checksum: z.string().min(1),
  }),
});

const TransaccionEventoSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount_in_cents: z.number().int(),
  currency: z.string(),
  reference: z.string(),
});

const INVALIDO: ResultadoVerificacion = { valido: false };

function resolverRuta(raiz: Record<string, unknown>, ruta: string): string | null {
  let actual: unknown = raiz;
  for (const parte of ruta.split('.')) {
    if (typeof actual !== 'object' || actual === null || !Object.hasOwn(actual, parte)) return null;
    actual = (actual as Record<string, unknown>)[parte];
  }
  if (typeof actual === 'string' || typeof actual === 'number' || typeof actual === 'boolean') {
    return String(actual);
  }
  return null;
}

/** Verifica la autenticidad de un evento. Nunca lanza; sin checksum válido no devuelve datos. */
export function verificarEventoWompi(
  body: unknown,
  checksumCabecera: string | undefined,
  eventsSecret: string,
): ResultadoVerificacion {
  const parsed = EventoWompiSchema.safeParse(body);
  if (!parsed.success) return INVALIDO;
  const e = parsed.data;

  if (checksumCabecera !== undefined && !checksumsIguales(checksumCabecera, e.signature.checksum)) {
    return INVALIDO;
  }

  const valores: string[] = [];
  for (const propiedad of e.signature.properties) {
    const valor = resolverRuta(e.data, propiedad);
    if (valor === null) return INVALIDO;
    valores.push(valor);
  }

  const esperado = calcularChecksumEvento(valores, e.timestamp, eventsSecret);
  if (!checksumsIguales(esperado, e.signature.checksum)) return INVALIDO;

  const tx = TransaccionEventoSchema.safeParse(e.data['transaction']);
  if (!tx.success) return INVALIDO;

  return {
    valido: true,
    evento: {
      evento: e.event,
      transaccionId: tx.data.id,
      estado: mapearEstadoWompi(tx.data.status),
      estadoProveedor: tx.data.status,
      reference: tx.data.reference,
      amountInCents: tx.data.amount_in_cents,
      currency: tx.data.currency,
      entorno: e.environment,
      timestamp: e.timestamp,
    },
  };
}

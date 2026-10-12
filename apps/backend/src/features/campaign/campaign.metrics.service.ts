import { Types } from 'mongoose';
import type { AccumulatorOperator, FilterQuery } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import {
  aggregateScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';
import type {
  EstadoCampana,
  ICampaignMetrics,
  ICampaignMetricsResponse,
  ICampaignMetricsResumen,
  ICampaignRecipientDocument,
  ICampaignsOverviewResponse,
  IConteosMetricas,
  IPuntoSerie,
  ITasasMetricas,
  IVentanasAtribucion,
  LeanCampaign,
  LeanCampaignRecipient,
} from './campaign.types.js';

/**
 * Métricas de campañas (HU-MARK-04): captura de eventos por destinatario y su agregación.
 *
 * Archivo propio, como `campaign.segment.service.ts`: lo usan `campaign.service.ts` (statuses de
 * Meta), `lead.service.ts` (conversiones) y el worker de inbound (respuestas). Dentro de
 * `campaign.service.ts` cerraría el ciclo `lead.service → campaign.service → … → lead.service`.
 *
 * **Idempotencia sin leer antes.** Cada marca se escribe con un `findOneAndUpdate` condicionado a
 * que el campo siga en `null`: si Meta reenvía el mismo webhook, o dos llegan a la vez, solo uno
 * casa el filtro. La agregación cuenta marcas, así que un evento repetido no infla nada.
 */

type TenantId = string | Types.ObjectId;

const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;
const TOP_CAMPANAS = 5;

/** Destinatarios a los que el mensaje llegó a salir: los únicos que pueden leer, responder o convertir. */
const ESTADOS_ALCANZADOS = ['enviado', 'entregado'] as const;

export function ventanasAtribucion(): IVentanasAtribucion {
  return {
    respuestaHoras: env.CAMPAIGN_REPLY_WINDOW_HOURS,
    conversionDias: env.CAMPAIGN_CONVERSION_WINDOW_DAYS,
  };
}

// ─── Captura de eventos ─────────────────────────────────────────────────────────

/**
 * `enviado → entregado`, una sola vez, y suma al contador del progreso en vivo.
 *
 * Solo desde `enviado`: un `delivered` que llegue tarde no resucita un `omitido` de una campaña
 * cancelada ni pisa un `fallido`. Y como el `read` también pasa por aquí, un `delivered` que llega
 * **después** del `read` ya no casa el filtro: no hay doble suma.
 */
export async function marcarEntregado(
  tenantId: TenantId,
  filtro: FilterQuery<ICampaignRecipientDocument>,
  at: Date,
): Promise<void> {
  const actualizado = await findOneAndUpdateScoped(
    CampaignRecipient,
    tenantId,
    { ...filtro, estado: 'enviado' },
    { $set: { estado: 'entregado', entregadoAt: at } },
    { new: true },
  ).lean<LeanCampaignRecipient | null>();

  if (!actualizado) return;

  // `totales.entregados` es el progreso en vivo de MARK-01. Las métricas no lo leen: agregan.
  await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: actualizado.campaignId },
    { $inc: { 'totales.entregados': 1 } },
  );
}

/** Marca un campo de evento si todavía está en `null`. Devuelve si escribió. */
async function marcarUnaVez(
  tenantId: TenantId,
  filtro: FilterQuery<ICampaignRecipientDocument>,
  campo: 'leidoAt' | 'respondidoAt' | 'convertidoAt',
  at: Date,
): Promise<boolean> {
  const actualizado = await findOneAndUpdateScoped(
    CampaignRecipient,
    tenantId,
    { ...filtro, estado: { $in: ESTADOS_ALCANZADOS }, [campo]: null },
    { $set: { [campo]: at } },
  ).lean<LeanCampaignRecipient | null>();
  return actualizado !== null;
}

/**
 * `status: read` de Meta (criterio 1). Leer implica entregar: si el `read` adelanta al
 * `delivered` —Meta no garantiza el orden—, el destinatario queda también `entregado`.
 */
export async function registrarLectura(
  tenantId: TenantId,
  metaMessageId: string,
  at: Date,
): Promise<void> {
  await marcarUnaVez(tenantId, { metaMessageId }, 'leidoAt', at);
  await marcarEntregado(tenantId, { metaMessageId }, at);
}

/**
 * El envío de campaña más reciente a este contacto dentro de la ventana, o `null`.
 *
 * **Last-touch estricto:** si ese envío ya tiene la marca, NO se cae a una campaña anterior. La
 * segunda respuesta del contacto es parte de la misma conversación, no un éxito de otra campaña.
 */
async function ultimoEnvio(
  tenantId: TenantId,
  clienteId: string,
  at: Date,
  ventanaMs: number,
): Promise<LeanCampaignRecipient | null> {
  return findOneScoped(CampaignRecipient, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    estado: { $in: ESTADOS_ALCANZADOS },
    enviadoAt: { $gte: new Date(at.getTime() - ventanaMs), $lte: at },
  })
    .sort({ enviadoAt: -1 })
    .lean<LeanCampaignRecipient | null>();
}

/**
 * Un mensaje entrante del contacto (criterio 2). Responder prueba que lo leyó y que le llegó, así
 * que completa esas marcas si faltaban (el contacto pudo tener apagadas las confirmaciones).
 */
export async function registrarRespuestaCampana(
  tenantId: TenantId,
  clienteId: string,
  at: Date,
): Promise<void> {
  const envio = await ultimoEnvio(tenantId, clienteId, at, env.CAMPAIGN_REPLY_WINDOW_HOURS * MS_HORA);
  if (!envio || envio.respondidoAt) return;

  const escrito = await marcarUnaVez(tenantId, { _id: envio._id }, 'respondidoAt', at);
  if (!escrito) return;

  await marcarUnaVez(tenantId, { _id: envio._id }, 'leidoAt', at);
  await marcarEntregado(tenantId, { _id: envio._id }, at);
}

/** El lead del contacto entró a una etapa `esConversion` (criterio 3). */
export async function registrarConversionCampana(
  tenantId: TenantId,
  clienteId: string,
  at: Date,
): Promise<void> {
  const envio = await ultimoEnvio(
    tenantId,
    clienteId,
    at,
    env.CAMPAIGN_CONVERSION_WINDOW_DAYS * MS_DIA,
  );
  if (!envio || envio.convertidoAt) return;

  await marcarUnaVez(tenantId, { _id: envio._id }, 'convertidoAt', at);
}

// ─── Agregación ─────────────────────────────────────────────────────────────────

function ratio(numerador: number, denominador: number): number | null {
  if (denominador === 0) return null;
  return Math.round((numerador / denominador) * 10_000) / 10_000;
}

/** Pura: la regla de las tasas vive aquí y se testea sin Mongo. */
export function calcularTasas(c: IConteosMetricas): ITasasMetricas {
  return {
    entrega: ratio(c.entregados, c.enviados),
    apertura: ratio(c.leidos, c.entregados),
    respuesta: ratio(c.respondidos, c.entregados),
    conversion: ratio(c.convertidos, c.entregados),
  };
}

function conteosVacios(): IConteosMetricas {
  return {
    destinatarios: 0,
    enviados: 0,
    entregados: 0,
    leidos: 0,
    respondidos: 0,
    convertidos: 0,
    fallidos: 0,
  };
}

function conMetricas(c: IConteosMetricas): ICampaignMetrics {
  return { ...c, tasas: calcularTasas(c) };
}

/** 1 si el campo de fecha existe y no es `null`. `$ifNull` cubre las filas anteriores al campo. */
function contarMarca(campo: string): AccumulatorOperator {
  return { $sum: { $cond: [{ $ifNull: [`$${campo}`, false] }, 1, 0] } };
}

function contarEstado(estados: readonly string[]): AccumulatorOperator {
  return { $sum: { $cond: [{ $in: ['$estado', [...estados]] }, 1, 0] } };
}

/**
 * Conteos por campaña, agregando `campaign_recipients` (la fuente de verdad, no los contadores).
 * `aggregateScoped` antepone el `$match` del tenant, así que un id ajeno simplemente no aparece.
 */
async function conteosPorCampana(
  tenantId: TenantId,
  campaignIds: Types.ObjectId[],
): Promise<Map<string, IConteosMetricas>> {
  if (campaignIds.length === 0) return new Map();

  const filas = await aggregateScoped<IConteosMetricas & { _id: Types.ObjectId }>(
    CampaignRecipient,
    tenantId,
    [
      { $match: { campaignId: { $in: campaignIds } } },
      {
        $group: {
          _id: '$campaignId',
          destinatarios: { $sum: 1 },
          enviados: contarEstado(ESTADOS_ALCANZADOS),
          entregados: contarEstado(['entregado']),
          fallidos: contarEstado(['fallido']),
          leidos: contarMarca('leidoAt'),
          respondidos: contarMarca('respondidoAt'),
          convertidos: contarMarca('convertidoAt'),
        },
      },
    ],
  );

  return new Map(
    filas.map(({ _id, ...conteos }) => [_id.toString(), { ...conteosVacios(), ...conteos }]),
  );
}

function sumar(a: IConteosMetricas, b: IConteosMetricas): IConteosMetricas {
  return {
    destinatarios: a.destinatarios + b.destinatarios,
    enviados: a.enviados + b.enviados,
    entregados: a.entregados + b.entregados,
    leidos: a.leidos + b.leidos,
    respondidos: a.respondidos + b.respondidos,
    convertidos: a.convertidos + b.convertidos,
    fallidos: a.fallidos + b.fallidos,
  };
}

// ─── Serie diaria ───────────────────────────────────────────────────────────────

/** Más días no caben en una gráfica legible; también acota el relleno de huecos. */
const MAX_DIAS_SERIE = 366;
/** Paso del recorrido que enumera los días: menor que 24 h para no saltarse uno con cambio de hora. */
const PASO_ENUMERACION_MS = 6 * MS_HORA;

/** `YYYY-MM-DD` de un instante en una zona IANA (`en-CA` formatea justo así). */
function diaEnZona(fecha: Date, zona: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

/** Todos los días entre `desde` y `hasta` en la zona, en orden y sin repetir. */
export function diasDelRango(desde: Date, hasta: Date, zona: string): string[] {
  const dias = new Set<string>();
  for (let t = desde.getTime(); t <= hasta.getTime(); t += PASO_ENUMERACION_MS) {
    dias.add(diaEnZona(new Date(t), zona));
    if (dias.size > MAX_DIAS_SERIE) break;
  }
  dias.add(diaEnZona(hasta, zona));
  return [...dias].slice(-MAX_DIAS_SERIE);
}

type CampoSerie = 'enviados' | 'respondidos' | 'convertidos';

/** Qué marca de tiempo fecha cada serie, y qué filas cuentan para ella. */
const MARCA_POR_SERIE: Record<CampoSerie, { campo: string; filtro: Record<string, unknown> }> = {
  // Un envío que acabó `fallido` no se dibuja como enviado: el embudo tampoco lo cuenta.
  enviados: { campo: 'enviadoAt', filtro: { estado: { $in: ESTADOS_ALCANZADOS } } },
  respondidos: { campo: 'respondidoAt', filtro: {} },
  convertidos: { campo: 'convertidoAt', filtro: {} },
};

/**
 * Cuántos envíos, respuestas y conversiones ocurrieron cada día del rango, para un conjunto de
 * campañas. Cada evento cae en el día de **su** marca de tiempo: la respuesta del martes a una
 * campaña del lunes suma al martes. Un `$facet` por serie: una sola pasada por el índice.
 */
async function serieDiaria(
  tenantId: TenantId,
  campaignIds: Types.ObjectId[],
  rango: { desde: Date; hasta: Date },
  zona: string,
): Promise<IPuntoSerie[]> {
  const dias = diasDelRango(rango.desde, rango.hasta, zona);
  const puntos = new Map<string, IPuntoSerie>(
    dias.map((dia) => [dia, { dia, enviados: 0, respondidos: 0, convertidos: 0 }]),
  );
  if (campaignIds.length === 0) return [...puntos.values()];

  const facetas = Object.fromEntries(
    (Object.entries(MARCA_POR_SERIE) as [CampoSerie, (typeof MARCA_POR_SERIE)[CampoSerie]][]).map(
      ([serie, { campo, filtro }]) => [
        serie,
        [
          { $match: { ...filtro, [campo]: { $gte: rango.desde, $lte: rango.hasta } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: `$${campo}`, timezone: zona } },
              total: { $sum: 1 },
            },
          },
        ],
      ],
    ),
  );

  const [resultado] = await aggregateScoped<Record<CampoSerie, { _id: string; total: number }[]>>(
    CampaignRecipient,
    tenantId,
    [{ $match: { campaignId: { $in: campaignIds } } }, { $facet: facetas }],
  );

  for (const serie of Object.keys(MARCA_POR_SERIE) as CampoSerie[]) {
    for (const { _id, total } of resultado?.[serie] ?? []) {
      const punto = puntos.get(_id);
      if (punto) punto[serie] = total;
    }
  }
  return [...puntos.values()];
}

/** `GET /api/campaigns/:id/metrics` (criterio 4). Otro tenant → 404, nunca 403. */
export async function getCampaignMetrics(
  tenantId: TenantId,
  campaignId: string,
  zona = 'UTC',
): Promise<ICampaignMetricsResponse> {
  const campana = await findByIdScoped(Campaign, tenantId, campaignId)
    .select({ _id: 1, iniciadaAt: 1 })
    .lean<{ _id: Types.ObjectId; iniciadaAt: Date | null } | null>();
  if (!campana) throw new AppError('Campaña no encontrada.', 404);

  const ahora = new Date();
  const ids = [campana._id];
  const [conteos, serie] = await Promise.all([
    conteosPorCampana(tenantId, ids),
    // La vida útil de la campaña en las métricas: de su arranque al cierre de la ventana de
    // conversión. Después ya no puede sumar nada, y estirar el eje solo añadiría ceros.
    campana.iniciadaAt
      ? serieDiaria(
          tenantId,
          ids,
          {
            desde: campana.iniciadaAt,
            hasta: new Date(
              Math.min(
                ahora.getTime(),
                campana.iniciadaAt.getTime() + (env.CAMPAIGN_CONVERSION_WINDOW_DAYS + 1) * MS_DIA,
              ),
            ),
          },
          zona,
        )
      : Promise.resolve([]),
  ]);

  return {
    campaignId: campana._id.toString(),
    ...conMetricas(conteos.get(campana._id.toString()) ?? conteosVacios()),
    ventanas: ventanasAtribucion(),
    serie,
    calculadoAt: ahora.toISOString(),
  };
}

/** Orden del top: tasa de respuesta descendente; sin tasa, al final; empate, más enviados primero. */
function porRespuesta(a: ICampaignMetricsResumen, b: ICampaignMetricsResumen): number {
  const ra = a.tasas.respuesta ?? -1;
  const rb = b.tasas.respuesta ?? -1;
  return rb - ra || b.enviados - a.enviados;
}

/** `GET /api/campaigns/metrics` (criterio 5): las campañas iniciadas en el rango, sumadas. */
export async function getCampaignsOverview(
  tenantId: TenantId,
  rango: { desde: Date; hasta: Date; zona?: string },
): Promise<ICampaignsOverviewResponse> {
  const campanas = await findScoped(Campaign, tenantId, {
    iniciadaAt: { $gte: rango.desde, $lte: rango.hasta },
  })
    .select({ nombre: 1, estado: 1, iniciadaAt: 1 })
    .lean<Pick<LeanCampaign, '_id' | 'nombre' | 'estado' | 'iniciadaAt'>[]>();

  const ids = campanas.map((c) => c._id);
  const [conteos, serie] = await Promise.all([
    conteosPorCampana(tenantId, ids),
    serieDiaria(tenantId, ids, rango, rango.zona ?? 'UTC'),
  ]);

  let total = conteosVacios();
  const resumenes: ICampaignMetricsResumen[] = campanas.map((c) => {
    const propios = conteos.get(c._id.toString()) ?? conteosVacios();
    total = sumar(total, propios);
    return {
      id: c._id.toString(),
      nombre: c.nombre,
      estado: c.estado as EstadoCampana,
      iniciadaAt: c.iniciadaAt ? c.iniciadaAt.toISOString() : null,
      ...conMetricas(propios),
    };
  });

  return {
    desde: rango.desde.toISOString(),
    hasta: rango.hasta.toISOString(),
    totalCampanas: campanas.length,
    ...conMetricas(total),
    campanas: resumenes.sort(porRespuesta).slice(0, TOP_CAMPANAS),
    ventanas: ventanasAtribucion(),
    serie,
    calculadoAt: new Date().toISOString(),
  };
}

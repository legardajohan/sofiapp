import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  findByIdScoped,
  findOneAndUpdateScoped,
  findScoped,
} from '../repositories/base.repository.js';
import { publishRealtime } from '../realtime/realtime.publisher.js';
import { Campaign } from '../features/campaign/campaign.model.js';
import { CampaignRecipient } from '../features/campaign/campaign-recipient.model.js';
import {
  encolarLote,
  launchCampaign,
  prepararImagenCabecera,
  resolverPresupuesto,
} from '../features/campaign/campaign.service.js';
import { sendOutbound } from '../features/message/message.service.js';
import type {
  CampaignJobData,
  CampaignStartJobData,
  LeanCampaign,
  LeanCampaignRecipient,
} from '../features/campaign/campaign.types.js';

/** Cuánto esperar antes de volver a mirar si el cupo de 24 h liberó capacidad. */
const REINTENTO_SIN_CUPO_MS = 15 * 60_000;

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mensaje de error legible para la fila del destinatario. Nunca vuelca el stack en la UI. */
function motivoDeError(err: unknown): string {
  const mensaje = (err as { message?: string })?.message;
  return (mensaje ?? 'Error desconocido al enviar.').slice(0, 300);
}

async function emitirProgreso(tenantId: string, campana: LeanCampaign): Promise<void> {
  await publishRealtime({
    type: 'campaign:progress',
    tenantId,
    campaignId: campana._id.toString(),
    estado: campana.estado,
    totales: campana.totales,
  });
}

/**
 * Cierra la campaña. `fallida` solo en el caso degenerado: se acabaron los destinatarios y no se
 * llegó a enviar ni uno — eso no es "terminó", es que no funcionó.
 */
async function finalizar(tenantId: string, campana: LeanCampaign): Promise<void> {
  const huboEnvios = campana.totales.enviados > 0;
  const cerrada = await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: campana._id },
    {
      $set: {
        estado: huboEnvios ? 'completada' : 'fallida',
        finalizadaAt: new Date(),
        motivo: huboEnvios ? null : 'Ningún destinatario pudo recibir el mensaje.',
      },
    },
    { new: true },
  ).lean<LeanCampaign | null>();

  if (cerrada) await emitirProgreso(tenantId, cerrada);
}

/**
 * Procesa un lote de una campaña (HU-MARK-01).
 *
 * Se re-encola a sí mismo hasta agotar los destinatarios. Puro respecto a BullMQ —recibe datos, no
 * un `Job`— para poder probarlo sin Redis, igual que los otros cuatro procesadores del proyecto.
 *
 * Tres invariantes que sostienen el criterio 9 del spec:
 *
 * 1. **Nunca envía más de lo disponible.** El presupuesto se recalcula en CADA lote, no una vez al
 *    lanzar: entre lote y lote pueden haber salido recordatorios de HU-FLOW-02 por el mismo número.
 * 2. **Sin cupo no falla: espera.** La campaña sigue `en_curso` y el job vuelve más tarde. Agotar
 *    el cupo diario es el funcionamiento normal de una campaña grande, no un error.
 * 3. **Un destinatario que falla no tumba el lote.** Se marca `fallido` con su motivo y sigue.
 */
export async function processCampaignJob(data: CampaignJobData): Promise<void> {
  const { tenantId, campaignId, lote } = data;

  const campana = await findByIdScoped(Campaign, tenantId, campaignId).lean<LeanCampaign | null>();
  if (!campana) {
    logger.warn('Lote de campaña sin campaña', { campaignId, tenantId });
    return;
  }

  // Pausar/cancelar no mata los jobs en vuelo: se comprueba aquí. Es más simple que perseguir un
  // job ya encolado y no depende de poder alcanzarlo.
  if (campana.estado !== 'en_curso') {
    logger.info('Lote de campaña descartado: la campaña no está en curso', {
      campaignId,
      estado: campana.estado,
    });
    return;
  }

  const presupuesto = await resolverPresupuesto(tenantId);

  if (presupuesto.disponible <= 0) {
    logger.info('Campaña sin cupo disponible: se reintenta más tarde', {
      campaignId,
      tier: presupuesto.tier,
      calidad: presupuesto.calidad,
    });
    await encolarLote(tenantId, campaignId, lote + 1, REINTENTO_SIN_CUPO_MS);
    return;
  }

  const tamano = Math.min(env.CAMPAIGN_BATCH_SIZE, presupuesto.disponible);

  const destinatarios = await findScoped(CampaignRecipient, tenantId, {
    campaignId: new Types.ObjectId(campaignId),
    estado: 'pendiente',
  })
    .limit(tamano)
    .lean<LeanCampaignRecipient[]>();

  if (destinatarios.length === 0) {
    await finalizar(tenantId, campana);
    return;
  }

  // HU-MARK-03 — imagen de cabecera. No-op si ya hay un id vigente; se renueva si caducaría a
  // mitad del envío. Si Meta no la acepta, el error sube y BullMQ reintenta el lote: sin imagen no
  // se puede enviar la plantilla, así que tampoco tiene sentido marcar a nadie como fallido.
  const imagenCabecera = await prepararImagenCabecera(tenantId, campana);

  let enviados = 0;
  let fallidos = 0;

  for (const [indice, destinatario] of destinatarios.entries()) {
    try {
      const mensaje = await sendOutbound(tenantId, destinatario.clienteId.toString(), {
        modo: 'plantilla',
        templateId: campana.templateId.toString(),
        parametros: campana.parametros,
        ...(imagenCabecera ? { imagenCabecera } : {}),
      });

      await findOneAndUpdateScoped(
        CampaignRecipient,
        tenantId,
        { _id: destinatario._id },
        {
          $set: {
            estado: 'enviado',
            metaMessageId: mensaje.metaMessageId ?? null,
            enviadoAt: new Date(),
            error: null,
          },
        },
      );
      enviados += 1;
    } catch (err) {
      // Deliberadamente por destinatario: un número dado de baja, un contacto borrado o un 470 de
      // Meta son casos de UNA fila. Propagar tumbaría el lote entero y BullMQ reintentaría envíos
      // ya hechos.
      await findOneAndUpdateScoped(
        CampaignRecipient,
        tenantId,
        { _id: destinatario._id },
        { $set: { estado: 'fallido', error: motivoDeError(err) } },
      );
      fallidos += 1;
      logger.warn('Destinatario de campaña fallido', {
        campaignId,
        destinatarioId: destinatario._id.toString(),
        error: String(err),
      });
    }

    // Cadencia. No se espera tras el último del lote: ahí ya se encola el siguiente con `delay`.
    if (indice < destinatarios.length - 1) await dormir(presupuesto.intervaloMs);
  }

  const actualizada = await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: campana._id },
    { $inc: { 'totales.enviados': enviados, 'totales.fallidos': fallidos } },
    { new: true },
  ).lean<LeanCampaign | null>();

  if (actualizada) await emitirProgreso(tenantId, actualizada);

  await encolarLote(tenantId, campaignId, lote + 1, presupuesto.intervaloMs);
}

/**
 * Arranca una campaña `programada` en nombre de quien la creó. Si no puede arrancar (cuota agotada,
 * calidad en rojo, plantilla retirada, imagen rechazada por Meta) la marca `fallida` con el motivo
 * en vez de dejarla esperando para siempre. Lo comparten el barrido y el arranque exacto.
 */
async function lanzarProgramada(
  tenantId: Types.ObjectId | string,
  campana: LeanCampaign,
): Promise<void> {
  const campaignId = campana._id.toString();
  try {
    await launchCampaign(tenantId.toString(), campana.creadaPor.toString(), campaignId);
    logger.info('Campaña programada lanzada', { campaignId });
  } catch (err) {
    await findOneAndUpdateScoped(
      Campaign,
      tenantId,
      { _id: campana._id },
      { $set: { estado: 'fallida', finalizadaAt: new Date(), motivo: motivoDeError(err) } },
    );
    logger.error('No se pudo lanzar una campaña programada', { campaignId, error: String(err) });
  }
}

/**
 * Barrido de campañas programadas cuya hora ya llegó.
 *
 * **Excepción cross-tenant documentada** (`docs/multi-tenancy.md` §5), la misma forma que el
 * barrido de recordatorios de HU-FLOW-02: la consulta es global porque el disparador lo es —una
 * pasada para toda la plataforma—, devuelve **solo identificadores**, y a partir de ahí cada
 * campaña se procesa con su propio `tenantId` y todo vuelve a pasar por `*Scoped`.
 */
export async function processCampaignSweep(): Promise<void> {
  const vencidas = await Campaign.find({
    estado: 'programada',
    programadaPara: { $lte: new Date() },
  })
    .select('tenantId')
    .limit(50)
    .lean<Array<{ _id: Types.ObjectId; tenantId: Types.ObjectId }>>();

  for (const { _id, tenantId } of vencidas) {
    const campana = await findByIdScoped(Campaign, tenantId, _id.toString()).lean<
      LeanCampaign | null
    >();
    if (!campana) continue;
    await lanzarProgramada(tenantId, campana);
  }
}

/**
 * Arranque **exacto** de una campaña programada (HU-MARK-03, criterios 4 y 5).
 *
 * Tres salidas sin hacer nada, y las tres son el funcionamiento normal:
 *
 * 1. La campaña no existe en ese tenant.
 * 2. Ya no está `programada`: la lanzó el barrido, la cancelaron o la lanzaron a mano.
 * 3. `programadaPara` ya no coincide con la del job: se reprogramó y este es el job de la hora
 *    anterior. El de la hora nueva ya está encolado con otro `jobId`.
 *
 * Job y barrido comparten la cola `campaign-broadcast`, que corre con `concurrency: 1`: nunca se
 * ejecutan a la vez, así que el segundo en llegar siempre ve la campaña ya `en_curso` (salida 2).
 */
export async function processScheduledStart(data: CampaignStartJobData): Promise<void> {
  const { tenantId, campaignId, programadaParaMs } = data;

  const campana = await findByIdScoped(Campaign, tenantId, campaignId).lean<LeanCampaign | null>();
  if (!campana) {
    logger.warn('Arranque programado sin campaña', { campaignId, tenantId });
    return;
  }
  if (campana.estado !== 'programada') return;
  if (!campana.programadaPara || campana.programadaPara.getTime() !== programadaParaMs) {
    logger.info('Arranque programado obsoleto: la campaña se reprogramó', { campaignId });
    return;
  }

  await lanzarProgramada(tenantId, campana);
}

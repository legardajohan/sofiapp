import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import {
  aggregateScoped,
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { CAMPAIGN_BATCH_JOB, campaignQueue } from '../../config/queues.js';
import { assertWithinQuota, incrementUsage } from '../usage/usage.service.js';
import { buildTemplatePayload } from '../whatsapp-template/whatsapp-template.service.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { getChannelCapacity } from '../channel/channel.service.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';
import { assertPuedeLanzar, calcularPresupuesto } from './campaign.pacing.js';
import { construirFiltroSegmento, previewSegmento } from './campaign.segment.service.js';
import type { ICliente } from '../cliente/cliente.types.js';
import type { LeanWhatsAppTemplate } from '../whatsapp-template/whatsapp-template.types.js';
import type { MessageStatus } from '../message/message.types.js';
import type {
  CreateCampaignDTO,
  EstadoDestinatario,
  ICampaignDetalleResponse,
  ICampaignRecipientResponse,
  ICampaignResponse,
  IPaged,
  IPresupuestoResponse,
  ISegmentPreviewResponse,
  ISegmentoFiltros,
  LeanCampaign,
  LeanCampaignRecipient,
} from './campaign.types.js';
import { ESTADOS_DESTINATARIO } from './campaign.types.js';

type TenantId = string | Types.ObjectId;

const MS_24H = 86_400_000;
/** Tamaño de cada `insertMany` al materializar el segmento. */
const LOTE_MATERIALIZACION = 500;

// ─── Mapeadores ─────────────────────────────────────────────────────────────────

function toCampaignResponse(c: LeanCampaign): ICampaignResponse {
  return {
    id: c._id.toString(),
    nombre: c.nombre,
    estado: c.estado,
    filtros: c.filtros,
    templateId: c.templateId.toString(),
    parametros: c.parametros,
    totales: c.totales,
    presupuesto: c.presupuesto,
    programadaPara: c.programadaPara ? c.programadaPara.toISOString() : null,
    iniciadaAt: c.iniciadaAt ? c.iniciadaAt.toISOString() : null,
    finalizadaAt: c.finalizadaAt ? c.finalizadaAt.toISOString() : null,
    motivo: c.motivo,
    createdAt: (c.createdAt ?? new Date()).toISOString(),
  };
}

function toRecipientResponse(r: LeanCampaignRecipient): ICampaignRecipientResponse {
  return {
    id: r._id.toString(),
    clienteId: r.clienteId.toString(),
    telefono: r.telefono,
    estado: r.estado,
    error: r.error,
    enviadoAt: r.enviadoAt ? r.enviadoAt.toISOString() : null,
  };
}

/** `findByIdScoped` + 404. Otro tenant recibe 404, **nunca 403**: no confirma que el id exista. */
async function getCampaignOrFail(tenantId: TenantId, campaignId: string): Promise<LeanCampaign> {
  const campana = await findByIdScoped(Campaign, tenantId, campaignId).lean<LeanCampaign | null>();
  if (!campana) throw new AppError('Campaña no encontrada.', 404);
  return campana;
}

// ─── Presupuesto ────────────────────────────────────────────────────────────────

/**
 * Destinatarios **únicos** alcanzados con plantilla en las últimas 24 h.
 *
 * Únicos y no mensajes: el tier de Meta cuenta *conversaciones iniciadas por la empresa*, así que
 * dos plantillas al mismo contacto el mismo día consumen una. De ahí el `$group` por `clienteId`.
 *
 * Cuenta TODO el outbound de tipo plantilla del tenant, no solo el de campañas: los recordatorios
 * de HU-FLOW-02 y los envíos manuales salen del mismo número y gastan el mismo cupo.
 */
export async function contarConsumo24h(tenantId: TenantId): Promise<number> {
  const desde = new Date(Date.now() - MS_24H);

  const filas = await aggregateScoped<{ _id: null; total: number }>(Message, tenantId, [
    // `$in` con los dos valores mientras dure la fase `expand` de HU-OMNI-06: la ventana rodante
    // mira 24 h hacia atrás, así que aunque el enum ya se escriba en español, aquí siguen entrando
    // documentos escritos con `'template'` hasta un día después del despliegue —y más, si el script
    // de migración se retrasa—. Contar solo uno de los dos devolvería un consumo menor del real, el
    // presupuesto saldría inflado y la campaña se pasaría del tier del número: Meta no responde con
    // un error, rechaza mensajes y degrada la calidad de la WABA. Se reduce a un único valor en la
    // fase `contract`, no antes.
    {
      $match: {
        direccion: 'outbound',
        tipo: { $in: ['plantilla', 'template'] },
        createdAt: { $gte: desde },
      },
    },
    { $group: { _id: '$clienteId' } },
    { $group: { _id: null, total: { $sum: 1 } } },
  ]);

  return filas[0]?.total ?? 0;
}

/** Presupuesto vigente: capacidad del número menos lo ya gastado en la ventana rodante. */
export async function resolverPresupuesto(tenantId: TenantId): Promise<IPresupuestoResponse> {
  const [capacidad, consumido24h] = await Promise.all([
    getChannelCapacity(tenantId),
    contarConsumo24h(tenantId),
  ]);

  return calcularPresupuesto({
    tier: capacidad.messagingTier,
    calidad: capacidad.qualityRating,
    consumido24h,
    margen: env.CAMPAIGN_SAFETY_MARGIN,
    intervaloMinimoMs: env.CAMPAIGN_MIN_INTERVAL_MS,
  });
}

// ─── Vista previa del segmento ──────────────────────────────────────────────────

export async function previewSegment(
  tenantId: TenantId,
  filtros: ISegmentoFiltros,
): Promise<ISegmentPreviewResponse> {
  const [segmento, presupuesto] = await Promise.all([
    previewSegmento(tenantId, filtros),
    resolverPresupuesto(tenantId),
  ]);

  return { ...segmento, presupuesto };
}

// ─── Alta y lanzamiento ─────────────────────────────────────────────────────────

/**
 * `jobId` estable por campaña y lote.
 *
 * **Sin `:` y sin ser un entero puro**: BullMQ rechaza ambas formas en un `jobId` personalizado, y
 * es exactamente el fallo que dejó el auto-reply sin encolar en HT-AI-02 (ver
 * `workers/inbound-message.processor.ts`). Que sea estable es además la idempotencia del lote:
 * encolar dos veces el mismo es un no-op.
 */
export function campaignJobId(campaignId: string, lote: number): string {
  return `campaign-${campaignId}-${lote}`;
}

export async function encolarLote(
  tenantId: string,
  campaignId: string,
  lote: number,
  delay = 0,
): Promise<void> {
  await campaignQueue.add(
    CAMPAIGN_BATCH_JOB,
    { tenantId, campaignId, lote },
    {
      jobId: campaignJobId(campaignId, lote),
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
}

export async function createCampaign(
  tenantId: TenantId,
  actorId: string,
  dto: CreateCampaignDTO,
): Promise<ICampaignResponse> {
  // Se valida la plantilla ANTES de crear nada: una campaña en borrador apuntando a una plantilla
  // rechazada es una trampa que solo explota al lanzar, cuando ya se invirtió tiempo en el wizard.
  await buildTemplatePayload(tenantId, dto.templateId, dto.parametros);

  const creada = await createScoped(Campaign, tenantId, {
    nombre: dto.nombre,
    filtros: dto.filtros,
    templateId: new Types.ObjectId(dto.templateId),
    parametros: dto.parametros,
    estado: dto.programadaPara ? 'programada' : 'borrador',
    programadaPara: dto.programadaPara ? new Date(dto.programadaPara) : null,
    creadaPor: new Types.ObjectId(actorId),
  });

  const campana = creada.toObject() as LeanCampaign;

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'campaign.create',
    entidad: 'campaign',
    entidadId: campana._id.toString(),
    antes: {},
    despues: { nombre: campana.nombre, estado: campana.estado },
  });

  if (dto.lanzar) return launchCampaign(tenantId, actorId, campana._id.toString());

  return toCampaignResponse(campana);
}

/**
 * Materializa el segmento como destinatarios. Devuelve cuántos quedaron.
 *
 * Va por lotes con un cursor y no con un `find()` completo en memoria: un tenant con 100 000
 * contactos no cabe en un array. `ordered: false` para que un duplicado (índice único
 * `{tenantId, campaignId, clienteId}`) se ignore en vez de tumbar el lote entero.
 */
async function materializarDestinatarios(
  tenantId: TenantId,
  campaignId: Types.ObjectId,
  filtros: ISegmentoFiltros,
): Promise<number> {
  const filtro = await construirFiltroSegmento(tenantId, filtros);
  const cursor = findScoped(Cliente, tenantId, filtro)
    .select('telefono')
    .lean<Pick<ICliente, 'telefono'> & { _id: Types.ObjectId }>()
    .cursor();

  let pendientes: Record<string, unknown>[] = [];
  let total = 0;

  const volcar = async (): Promise<void> => {
    if (pendientes.length === 0) return;
    await CampaignRecipient.insertMany(pendientes, { ordered: false });
    pendientes = [];
  };

  for await (const contacto of cursor) {
    pendientes.push({
      // `insertMany` no pasa por `createScoped`, así que el tenant se inyecta aquí de forma
      // explícita — y siempre el del argumento, nunca uno que venga del contacto.
      tenantId: new Types.ObjectId(tenantId.toString()),
      campaignId,
      clienteId: contacto._id,
      telefono: contacto.telefono,
      estado: 'pendiente',
    });
    total += 1;
    if (pendientes.length >= LOTE_MATERIALIZACION) await volcar();
  }
  await volcar();

  return total;
}

export async function launchCampaign(
  tenantId: TenantId,
  actorId: string,
  campaignId: string,
): Promise<ICampaignResponse> {
  const campana = await getCampaignOrFail(tenantId, campaignId);

  // Idempotencia (criterio 12): relanzar algo ya en marcha devuelve lo que hay, sin duplicar
  // destinatarios ni volver a consumir cuota.
  if (campana.estado === 'en_curso' || campana.estado === 'completada') {
    return toCampaignResponse(campana);
  }
  if (campana.estado === 'cancelada') {
    throw new AppError('Una campaña cancelada no se puede relanzar.', 409);
  }

  await assertWithinQuota(tenantId, 'campanasMes');

  // Revalida la plantilla en el momento del envío: pudo pasar a PAUSED entre el alta y el lanzamiento.
  await buildTemplatePayload(tenantId, campana.templateId.toString(), campana.parametros);

  const presupuesto = await resolverPresupuesto(tenantId);
  assertPuedeLanzar(presupuesto);

  const destinatarios = await materializarDestinatarios(tenantId, campana._id, campana.filtros);

  if (destinatarios === 0) {
    throw new AppError('El segmento no incluye a ningún contacto.', 422);
  }

  const actualizada = await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: campana._id },
    {
      $set: {
        estado: 'en_curso',
        iniciadaAt: new Date(),
        programadaPara: null,
        'totales.destinatarios': destinatarios,
        presupuesto: {
          tier: presupuesto.tier,
          calidad: presupuesto.calidad,
          limiteDiario: presupuesto.limiteDiario,
          intervaloMs: presupuesto.intervaloMs,
        },
      },
    },
    { new: true },
  ).lean<LeanCampaign>();

  if (!actualizada) throw new AppError('Campaña no encontrada.', 404);

  await incrementUsage(tenantId, 'campanasMes');
  await encolarLote(tenantId.toString(), campana._id.toString(), 0);

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'campaign.launch',
    entidad: 'campaign',
    entidadId: campana._id.toString(),
    antes: { estado: campana.estado },
    despues: { estado: 'en_curso', destinatarios },
  });

  return toCampaignResponse(actualizada);
}

// ─── Transiciones ───────────────────────────────────────────────────────────────

export async function pauseCampaign(
  tenantId: TenantId,
  actorId: string,
  campaignId: string,
): Promise<ICampaignResponse> {
  const campana = await getCampaignOrFail(tenantId, campaignId);
  if (campana.estado === 'pausada') return toCampaignResponse(campana);
  if (campana.estado !== 'en_curso') {
    throw new AppError('Solo se puede pausar una campaña en curso.', 409, { estado: campana.estado });
  }

  const actualizada = await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: campana._id },
    { $set: { estado: 'pausada' } },
    { new: true },
  ).lean<LeanCampaign>();
  if (!actualizada) throw new AppError('Campaña no encontrada.', 404);

  // No se cancelan los jobs encolados: el propio procesador comprueba el estado al arrancar y sale
  // sin enviar. Es más simple y no depende de poder alcanzar un job ya en vuelo.
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'campaign.pause',
    entidad: 'campaign',
    entidadId: campana._id.toString(),
    antes: { estado: campana.estado },
    despues: { estado: 'pausada' },
  });

  return toCampaignResponse(actualizada);
}

export async function resumeCampaign(
  tenantId: TenantId,
  actorId: string,
  campaignId: string,
): Promise<ICampaignResponse> {
  const campana = await getCampaignOrFail(tenantId, campaignId);
  if (campana.estado === 'en_curso') return toCampaignResponse(campana);
  if (campana.estado !== 'pausada') {
    throw new AppError('Solo se puede reanudar una campaña pausada.', 409, { estado: campana.estado });
  }

  const presupuesto = await resolverPresupuesto(tenantId);
  assertPuedeLanzar(presupuesto);

  const actualizada = await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: campana._id },
    { $set: { estado: 'en_curso' } },
    { new: true },
  ).lean<LeanCampaign>();
  if (!actualizada) throw new AppError('Campaña no encontrada.', 404);

  // Lote nuevo, para que el `jobId` no choque con el del lote en el que se pausó.
  const lote = Math.floor(Date.now() / 1000);
  await encolarLote(tenantId.toString(), campana._id.toString(), lote);

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'campaign.resume',
    entidad: 'campaign',
    entidadId: campana._id.toString(),
    antes: { estado: 'pausada' },
    despues: { estado: 'en_curso' },
  });

  return toCampaignResponse(actualizada);
}

export async function cancelCampaign(
  tenantId: TenantId,
  actorId: string,
  campaignId: string,
): Promise<ICampaignResponse> {
  const campana = await getCampaignOrFail(tenantId, campaignId);
  if (campana.estado === 'cancelada') return toCampaignResponse(campana);
  if (campana.estado === 'completada') {
    throw new AppError('La campaña ya terminó.', 409, { estado: campana.estado });
  }

  // Los pendientes quedan `omitido`, no `fallido`: a esa gente no se le llegó a escribir, y un
  // `fallido` sugeriría un problema del número que no existe.
  const { modifiedCount } = await updateManyScoped(
    CampaignRecipient,
    tenantId,
    { campaignId: campana._id, estado: 'pendiente' },
    { $set: { estado: 'omitido' } },
  );

  const actualizada = await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: campana._id },
    {
      $set: {
        estado: 'cancelada',
        finalizadaAt: new Date(),
        motivo: 'Cancelada manualmente.',
        'totales.omitidos': modifiedCount,
      },
    },
    { new: true },
  ).lean<LeanCampaign>();
  if (!actualizada) throw new AppError('Campaña no encontrada.', 404);

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'campaign.cancel',
    entidad: 'campaign',
    entidadId: campana._id.toString(),
    antes: { estado: campana.estado },
    despues: { estado: 'cancelada', omitidos: modifiedCount },
  });

  return toCampaignResponse(actualizada);
}

// ─── Lecturas ───────────────────────────────────────────────────────────────────

export async function listCampaigns(
  tenantId: TenantId,
  query: { page: number; limit: number; estado?: string },
): Promise<IPaged<ICampaignResponse>> {
  const filtro: Record<string, unknown> = {};
  if (query.estado) filtro['estado'] = query.estado;

  const [campanas, total] = await Promise.all([
    findScoped(Campaign, tenantId, filtro)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<LeanCampaign[]>(),
    countScoped(Campaign, tenantId, filtro),
  ]);

  return {
    data: campanas.map(toCampaignResponse),
    page: query.page,
    limit: query.limit,
    total,
  };
}

/** Desglose vivo por estado. Los cinco estados salen SIEMPRE, con 0 si no hay ninguno. */
async function desgloseDestinatarios(
  tenantId: TenantId,
  campaignId: Types.ObjectId,
): Promise<Record<EstadoDestinatario, number>> {
  const filas = await aggregateScoped<{ _id: EstadoDestinatario; total: number }>(
    CampaignRecipient,
    tenantId,
    [{ $match: { campaignId } }, { $group: { _id: '$estado', total: { $sum: 1 } } }],
  );

  const base = Object.fromEntries(ESTADOS_DESTINATARIO.map((e) => [e, 0])) as Record<
    EstadoDestinatario,
    number
  >;
  for (const fila of filas) base[fila._id] = fila.total;
  return base;
}

export async function getCampaign(
  tenantId: TenantId,
  campaignId: string,
): Promise<ICampaignDetalleResponse> {
  const campana = await getCampaignOrFail(tenantId, campaignId);

  const [plantilla, desglose] = await Promise.all([
    findByIdScoped(WhatsAppTemplate, tenantId, campana.templateId.toString())
      .lean<LeanWhatsAppTemplate | null>(),
    desgloseDestinatarios(tenantId, campana._id),
  ]);

  return {
    ...toCampaignResponse(campana),
    // `null` si la plantilla se borró del catálogo: la campaña histórica sigue siendo legible.
    plantilla: plantilla
      ? {
          id: plantilla._id.toString(),
          name: plantilla.name,
          language: plantilla.language,
          cuerpo: plantilla.components.find((c) => c.type === 'BODY')?.text ?? null,
        }
      : null,
    desglose,
  };
}

export async function listRecipients(
  tenantId: TenantId,
  campaignId: string,
  query: { page: number; limit: number; estado?: string },
): Promise<IPaged<ICampaignRecipientResponse>> {
  // Resuelve primero la campaña: así un id de otro tenant da 404 y no una página vacía.
  const campana = await getCampaignOrFail(tenantId, campaignId);

  const filtro: Record<string, unknown> = { campaignId: campana._id };
  if (query.estado) filtro['estado'] = query.estado;

  const [destinatarios, total] = await Promise.all([
    findScoped(CampaignRecipient, tenantId, filtro)
      .sort({ enviadoAt: -1, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<LeanCampaignRecipient[]>(),
    countScoped(CampaignRecipient, tenantId, filtro),
  ]);

  return {
    data: destinatarios.map(toRecipientResponse),
    page: query.page,
    limit: query.limit,
    total,
  };
}

// ─── Puente con el webhook de entrega ───────────────────────────────────────────

/** Estados de Meta que interesan al destinatario. `sent` ya se marcó al enviar; `read` no cambia nada. */
const ESTADO_POR_STATUS: Partial<Record<MessageStatus, EstadoDestinatario>> = {
  delivered: 'entregado',
  failed: 'fallido',
};

/**
 * Propaga el `status` del webhook al destinatario de campaña (criterio 10).
 *
 * Lo llama `updateDeliveryStatus` (`message.service.ts`), que es el único camino por el que entran
 * los `statuses` de Meta. Si el `metaMessageId` no pertenece a ninguna campaña, es un no-op: la
 * inmensa mayoría de los mensajes del sistema no lo son.
 *
 * El `tenantId` entra por argumento y filtra la búsqueda: resolver un `metaMessageId` sin tenant es
 * exactamente la fuga que cerró HT-WA-01-V2.
 */
export async function applyDeliveryStatusToRecipient(
  tenantId: TenantId,
  metaMessageId: string,
  status: MessageStatus,
): Promise<void> {
  const destino = ESTADO_POR_STATUS[status];
  if (!destino) return;

  const actualizado = await findOneAndUpdateScoped(
    CampaignRecipient,
    tenantId,
    // Solo desde `enviado`: un `delivered` que llegue tarde no puede resucitar un `omitido` de una
    // campaña cancelada ni pisar un `fallido` ya registrado.
    { metaMessageId, estado: 'enviado' },
    { $set: { estado: destino } },
    { new: true },
  ).lean<LeanCampaignRecipient | null>();

  if (!actualizado) return;

  const campo = destino === 'entregado' ? 'totales.entregados' : 'totales.fallidos';
  await findOneAndUpdateScoped(
    Campaign,
    tenantId,
    { _id: actualizado.campaignId },
    { $inc: { [campo]: 1 } },
  );
}

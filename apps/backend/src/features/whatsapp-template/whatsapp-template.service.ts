import type { FilterQuery, Types } from 'mongoose';
import {
  createScoped,
  countScoped,
  findByIdScoped,
  findOneScoped,
  findScoped,
  findOneAndUpdateScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getIntegrationWithToken } from '../channel/channel.service.js';
import {
  metaTemplateClient,
  type IMetaTemplateRaw,
} from '../../integrations/meta/meta-template.client.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import { firmarUrlMedia, recursoImagenPlantilla } from '../media/media.token.js';
import { asegurarMetaMediaId, extensionImagen } from '../media/media-meta-cache.js';
import {
  aImagenAlmacenada,
  consumirSubida,
  exigirImagen,
  liberarSubida,
  registrarSubida,
  toUploadResponse,
  validarImagenCabecera,
} from '../media/media-upload.service.js';
import type { IImagenSubida, IUploadResponse, LeanMediaUpload } from '../media/media.types.js';
import { WhatsAppTemplate } from './whatsapp-template.model.js';
import { CATEGORIAS_CON_IMAGEN, ESTADOS_PLANTILLA, MOTIVOS_RECHAZO } from './whatsapp-template.types.js';
import type {
  CreateTemplateBody,
  EstadoPlantilla,
  FormatoCabecera,
  ICabeceraEnvio,
  IImagenPlantillaResponse,
  IMotivoRechazoResponse,
  IPlantillaComponente,
  IWhatsAppTemplateDocument,
  IWhatsAppTemplateResponse,
  LeanWhatsAppTemplate,
  ListTemplatesQuery,
  SyncTemplatesResponse,
  WhatsAppTemplatesListResponse,
} from './whatsapp-template.types.js';

type TenantId = string | Types.ObjectId;

/** Estados en los que vale la pena volver a preguntarle a Meta (barrido de respaldo, HT-WA-04). */
export const ESTADOS_EN_REVISION: readonly EstadoPlantilla[] = ['PENDING', 'IN_APPEAL'];

/**
 * Cuenta los placeholders `{{n}}` distintos del cuerpo y exige que sean consecutivos desde 1
 * (Meta lo requiere para aprobar la plantilla). Un cuerpo sin placeholders devuelve 0.
 */
function derivarParametrosBody(cuerpo: string): number {
  const encontrados = [...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const unicos = [...new Set(encontrados)].sort((a, b) => a - b);
  const esperados = unicos.map((_, i) => i + 1);
  const consecutivos = unicos.every((n, i) => n === esperados[i]);
  if (!consecutivos) {
    throw new AppError(
      'Los parámetros de la plantilla deben ser consecutivos empezando en {{1}}.',
      400,
    );
  }
  return unicos.length;
}

function componenteDe(
  components: IPlantillaComponente[],
  type: IPlantillaComponente['type'],
): IPlantillaComponente | undefined {
  return components.find((c) => c.type === type);
}

function bodyTextOf(components: IPlantillaComponente[]): string | null {
  return componenteDe(components, 'BODY')?.text ?? null;
}

/** Formato de la cabecera según los `components` persistidos. Sin `HEADER` → `NINGUNA`. */
export function formatoCabecera(tpl: Pick<LeanWhatsAppTemplate, 'components'>): FormatoCabecera {
  const header = componenteDe(tpl.components, 'HEADER');
  if (!header) return 'NINGUNA';
  return header.format ?? 'TEXT';
}

/**
 * Estado de Meta → estado de SofiApp. Meta tiene más estados (y eventos de webhook) que los que el
 * producto modela; los que no encajan se aproximan al más prudente en vez de guardar un valor que el
 * enum no conoce.
 */
export function estadoDesdeMeta(raw: string): EstadoPlantilla {
  const valor = raw.toUpperCase();
  if ((ESTADOS_PLANTILLA as readonly string[]).includes(valor)) return valor as EstadoPlantilla;
  if (valor === 'REINSTATED') return 'APPROVED';
  if (valor === 'LIMIT_EXCEEDED') return 'REJECTED';
  if (valor === 'PENDING_DELETION' || valor === 'DELETED' || valor === 'ARCHIVED') return 'DISABLED';
  logger.warn('Estado de plantilla de Meta desconocido: se trata como PENDING', { estado: raw });
  return 'PENDING';
}

/** `rejected_reason`/`reason` de Meta → código guardado. `NONE` y vacíos no son un motivo. */
function motivoDesdeMeta(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const valor = raw.trim().toUpperCase();
  return valor === '' || valor === 'NONE' ? null : valor;
}

export function motivoRechazoResponse(codigo: string | null): IMotivoRechazoResponse | null {
  if (!codigo) return null;
  return {
    codigo,
    mensaje: MOTIVOS_RECHAZO[codigo] ?? `Meta rechazó la plantilla (motivo: ${codigo}).`,
  };
}

/**
 * URL firmada de la imagen por defecto. Relativa a la base del API, igual que la imagen de una
 * campaña: el front le antepone `VITE_API_BASE_URL`.
 */
function toImagenResponse(doc: LeanWhatsAppTemplate): IImagenPlantillaResponse | null {
  // `?.`/`??`: las plantillas anteriores a HT-WA-04 no traen el campo en el documento crudo.
  const imagen = doc.imagenDefecto ?? null;
  if (!imagen) return null;
  const templateId = doc._id.toString();
  const token = firmarUrlMedia(doc.tenantId.toString(), recursoImagenPlantilla(templateId));
  return {
    url: `/media/templates/${templateId}/imagen?t=${token}`,
    mimeType: imagen.mimeType,
    tamanoBytes: imagen.tamanoBytes,
  };
}

function mapToResponse(doc: LeanWhatsAppTemplate): IWhatsAppTemplateResponse {
  return {
    id: doc._id.toString(),
    name: doc.name,
    language: doc.language,
    category: doc.category,
    status: doc.status,
    cuerpo: bodyTextOf(doc.components),
    ejemplos: componenteDe(doc.components, 'BODY')?.example?.body_text?.[0] ?? [],
    parametrosBody: doc.parametrosBody,
    cabecera: formatoCabecera(doc),
    pie: componenteDe(doc.components, 'FOOTER')?.text ?? null,
    imagen: toImagenResponse(doc),
    motivoRechazo: motivoRechazoResponse(doc.motivoRechazo ?? null),
    obsoleta: doc.obsoleta,
    syncedAt: doc.syncedAt.toISOString(),
  };
}

/** Avisa en vivo del cambio de estado (HT-WA-04, criterio 7). Nunca lanza. */
async function publicarEstado(doc: LeanWhatsAppTemplate): Promise<void> {
  await publishRealtime({
    type: 'template:status-updated',
    tenantId: doc.tenantId.toString(),
    templateId: doc._id.toString(),
    status: doc.status,
    motivoRechazo: motivoRechazoResponse(doc.motivoRechazo ?? null),
  });
}

async function getTemplateOrFail(tenantId: TenantId, id: string): Promise<LeanWhatsAppTemplate> {
  const tpl = await findByIdScoped(WhatsAppTemplate, tenantId, id)
    .lean<LeanWhatsAppTemplate | null>()
    .exec();
  if (!tpl) throw new AppError('Plantilla no encontrada.', 404);
  return tpl;
}

export async function listTemplates(
  tenantId: TenantId,
  query: ListTemplatesQuery,
): Promise<WhatsAppTemplatesListResponse> {
  const filtro: FilterQuery<IWhatsAppTemplateDocument> = {};
  if (query.status) filtro.status = query.status;
  if (query.category) filtro.category = query.category;

  const [templates, total] = await Promise.all([
    findScoped(WhatsAppTemplate, tenantId, filtro)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<LeanWhatsAppTemplate[]>()
      .exec(),
    countScoped(WhatsAppTemplate, tenantId, filtro).exec(),
  ]);

  return { data: templates.map(mapToResponse), total, page: query.page, limit: query.limit };
}

export async function getTemplate(
  tenantId: TenantId,
  id: string,
): Promise<IWhatsAppTemplateResponse> {
  return mapToResponse(await getTemplateOrFail(tenantId, id));
}

/** Campos que se copian de Meta en cada sincronización. Nunca toca `imagenDefecto`. */
function camposDesdeMeta(tpl: IMetaTemplateRaw): Record<string, unknown> {
  const cuerpo = bodyTextOf(tpl.components);
  const status = estadoDesdeMeta(tpl.status);
  return {
    metaTemplateId: tpl.id,
    category: tpl.category,
    status,
    motivoRechazo: status === 'REJECTED' ? motivoDesdeMeta(tpl.rejected_reason) : null,
    components: tpl.components,
    parametrosBody: cuerpo ? derivarParametrosBody(cuerpo) : 0,
    syncedAt: new Date(),
  };
}

/**
 * Espejo del catálogo real en Meta: crea las nuevas, actualiza el `status` de las existentes y
 * marca `obsoleta: true` las que Meta ya no devuelve (nunca se borran: puede haber `Message`
 * históricos que las referencian). Idempotente — se puede ejecutar tantas veces como haga falta.
 *
 * HT-WA-04: también guarda el motivo de rechazo y avisa en vivo de cada cambio de estado, porque es
 * el respaldo del webhook `message_template_status_update`.
 */
export async function syncTemplates(tenantId: TenantId): Promise<SyncTemplatesResponse> {
  const integration = await getIntegrationWithToken(tenantId);
  const remotas = await metaTemplateClient.list(integration.wabaId, integration.accessToken);

  let creadas = 0;
  let actualizadas = 0;
  const vistas: Array<{ name: string; language: string }> = [];

  for (const tpl of remotas) {
    const previa = await findOneScoped(WhatsAppTemplate, tenantId, {
      name: tpl.name,
      language: tpl.language,
    })
      .lean<LeanWhatsAppTemplate | null>()
      .exec();

    const actual = await findOneAndUpdateScoped(
      WhatsAppTemplate,
      tenantId,
      { name: tpl.name, language: tpl.language },
      { $set: { ...camposDesdeMeta(tpl), obsoleta: false } },
      { upsert: true, new: true },
    ).lean<LeanWhatsAppTemplate | null>();

    if (previa) actualizadas++;
    else creadas++;
    vistas.push({ name: tpl.name, language: tpl.language });

    if (previa && actual && previa.status !== actual.status) await publicarEstado(actual);
  }

  const filtroObsoletas: FilterQuery<IWhatsAppTemplateDocument> = { obsoleta: false };
  if (vistas.length > 0) {
    filtroObsoletas.$nor = vistas.map(({ name, language }) => ({ name, language }));
  }
  const resultado = await updateManyScoped(WhatsAppTemplate, tenantId, filtroObsoletas, {
    $set: { obsoleta: true },
  });

  return { creadas, actualizadas, obsoletas: resultado.modifiedCount };
}

/** Refresca UNA plantilla contra Meta (HT-WA-04, criterio 6): «Actualizar estado» del listado. */
export async function syncTemplate(
  tenantId: TenantId,
  id: string,
): Promise<IWhatsAppTemplateResponse> {
  const previa = await getTemplateOrFail(tenantId, id);
  const integration = await getIntegrationWithToken(tenantId);
  const remota = await metaTemplateClient.get(previa.metaTemplateId, integration.accessToken);

  const actual = await findOneAndUpdateScoped(
    WhatsAppTemplate,
    tenantId,
    { _id: previa._id },
    { $set: camposDesdeMeta(remota) },
    { new: true },
  ).lean<LeanWhatsAppTemplate | null>();
  if (!actual) throw new AppError('Plantilla no encontrada.', 404);

  if (previa.status !== actual.status) await publicarEstado(actual);
  return mapToResponse(actual);
}

/**
 * Aplica un evento `message_template_status_update` (HT-WA-04, criterio 5). Lo llama el worker con
 * el tenant ya resuelto por la WABA del webhook; la búsqueda por `metaTemplateId` va scoped a ese
 * tenant, así que un evento nunca toca plantillas de otra empresa.
 *
 * Devuelve la plantilla actualizada, o `null` si no hubo nada que aplicar.
 */
export async function aplicarEstadoPlantilla(
  tenantId: TenantId,
  metaTemplateId: string,
  evento: string,
  motivo: string | null,
): Promise<LeanWhatsAppTemplate | null> {
  const valor = evento.toUpperCase();

  // `FLAGGED` avisa de baja calidad antes de pausar: la plantilla sigue aprobada y enviable.
  if (valor === 'FLAGGED') {
    logger.info('Plantilla marcada por calidad en Meta', { tenantId: String(tenantId), metaTemplateId });
    return null;
  }

  const status = estadoDesdeMeta(valor);
  const set: Record<string, unknown> = {
    status,
    motivoRechazo: status === 'REJECTED' ? motivoDesdeMeta(motivo) : null,
    syncedAt: new Date(),
  };
  if (valor === 'PENDING_DELETION' || valor === 'DELETED') set['obsoleta'] = true;

  const actual = await findOneAndUpdateScoped(
    WhatsAppTemplate,
    tenantId,
    { metaTemplateId },
    { $set: set },
    { new: true },
  ).lean<LeanWhatsAppTemplate | null>();

  if (!actual) {
    // Creada en Business Manager y aún no sincronizada: la recoge el barrido de respaldo.
    logger.info('Evento de plantilla sin copia local', { tenantId: String(tenantId), metaTemplateId });
    return null;
  }

  await publicarEstado(actual);
  return actual;
}

/**
 * Primer paso del alta con imagen (HT-WA-04, criterios 2 y 4): valida la imagen, la sube a Meta por
 * la Resumable Upload API para obtener el `header_handle` y la guarda en nuestro almacenamiento.
 *
 * Meta va ANTES que el bucket: si rechaza la imagen, no queda nada nuestro que limpiar.
 */
export async function subirMuestraPlantilla(
  tenantId: TenantId,
  archivo: IImagenSubida | undefined,
): Promise<IUploadResponse> {
  const imagen = exigirImagen(archivo);
  const mimeType = validarImagenCabecera(imagen);
  const integration = await getIntegrationWithToken(tenantId);
  const { headerHandle } = await metaTemplateClient.subirMuestra(integration.accessToken, {
    buffer: imagen.buffer,
    mimeType,
  });
  const subida = await registrarSubida(tenantId, imagen, mimeType, 'muestra-plantilla', headerHandle);
  return toUploadResponse(subida);
}

/**
 * Crea la plantilla en Meta y solo entonces la persiste localmente en `PENDING`: si Meta rechaza
 * la creación, `metaTemplateClient.create` lanza y no queda ningún documento local huérfano.
 *
 * HT-WA-04: con `cabecera.formato = 'IMAGE'` consume la subida de muestra (una sola vez), manda el
 * `HEADER` con su `header_handle` y deja esa imagen como imagen por defecto. Si Meta falla, la
 * subida vuelve a quedar disponible para reintentar sin volver a subir el archivo.
 */
export async function createTemplate(
  tenantId: TenantId,
  dto: CreateTemplateBody,
): Promise<IWhatsAppTemplateResponse> {
  const parametrosBody = derivarParametrosBody(dto.cuerpo);
  const cabecera = dto.cabecera ?? { formato: 'NINGUNA' as const };

  if (cabecera.formato === 'IMAGE' && !CATEGORIAS_CON_IMAGEN.includes(dto.category)) {
    throw new AppError('La imagen de encabezado solo está disponible para Marketing y Utilidad.', 400);
  }

  const muestra: LeanMediaUpload | null =
    cabecera.formato === 'IMAGE'
      ? await consumirSubida(tenantId, cabecera.uploadId, 'muestra-plantilla')
      : null;

  const components: IPlantillaComponente[] = [];
  if (muestra?.headerHandle) {
    components.push({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: [muestra.headerHandle] },
    });
  }
  components.push({
    type: 'BODY',
    text: dto.cuerpo,
    ...(dto.ejemplos.length > 0 ? { example: { body_text: [dto.ejemplos] } } : {}),
  });
  if (dto.pie) components.push({ type: 'FOOTER', text: dto.pie });

  let creada: { id: string; status: string };
  try {
    const integration = await getIntegrationWithToken(tenantId);
    creada = await metaTemplateClient.create(integration.wabaId, integration.accessToken, {
      name: dto.name,
      language: dto.language,
      category: dto.category,
      components,
    });
  } catch (err) {
    if (muestra) await liberarSubida(tenantId, muestra._id.toString());
    throw err;
  }

  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: creada.id,
    name: dto.name,
    language: dto.language,
    category: dto.category,
    status: estadoDesdeMeta(creada.status),
    components,
    parametrosBody,
    syncedAt: new Date(),
    obsoleta: false,
    imagenDefecto: muestra ? aImagenAlmacenada(muestra) : null,
    motivoRechazo: null,
  });

  return mapToResponse(doc.toObject() as LeanWhatsAppTemplate);
}

/**
 * Resuelve la plantilla y comprueba que es enviable con estos parámetros y esta media de cabecera.
 *
 * Orden fijo: existe (404) → `APPROVED` (422) → nº de parámetros (400) → cabecera. Lo comparten el
 * envío (`buildTemplatePayload`) y el programador de campañas (`assertContenidoCompatible`), que
 * valida **antes** de tener un `metaMediaId`: solo sabe si habrá imagen de reemplazo o no.
 */
async function resolverPlantillaEnviable(
  tenantId: TenantId,
  templateId: string,
  parametros: string[],
  llevaImagen: boolean,
): Promise<LeanWhatsAppTemplate> {
  const tpl = await getTemplateOrFail(tenantId, templateId);

  if (tpl.status !== 'APPROVED') {
    throw new AppError('La plantilla no está aprobada por Meta.', 422, { status: tpl.status });
  }
  if (parametros.length !== tpl.parametrosBody) {
    throw new AppError('Número de parámetros incorrecto.', 400, {
      esperados: tpl.parametrosBody,
      recibidos: parametros.length,
    });
  }

  // HU-MARK-03 — media de cabecera. `DOCUMENT` y `VIDEO` quedan fuera de alcance: Meta exigiría el
  // archivo en el envío y no hay forma de adjuntarlo, así que el envío fallaría en cada destinatario.
  const cabecera = formatoCabecera(tpl);
  if (cabecera === 'DOCUMENT' || cabecera === 'VIDEO') {
    throw new AppError('Las plantillas con documento o vídeo en la cabecera aún no se admiten.', 422, {
      cabecera,
    });
  }
  // HT-WA-04: sin imagen de reemplazo vale la imagen por defecto; sin ninguna de las dos, no hay envío.
  if (cabecera === 'IMAGE' && !llevaImagen && !tpl.imagenDefecto) {
    throw new AppError(
      'La plantilla requiere una imagen y no hay ninguna disponible: adjunta una imagen.',
      422,
      { cabecera },
    );
  }
  if (cabecera !== 'IMAGE' && llevaImagen) {
    throw new AppError('Esta plantilla no admite imagen en la cabecera.', 400, { cabecera });
  }

  return tpl;
}

/**
 * Valida contenido ↔ plantilla sin armar el payload (HU-MARK-03). Lo usa el programador de
 * campañas al guardar, cuando la imagen aún no se ha subido a Meta.
 */
export async function assertContenidoCompatible(
  tenantId: TenantId,
  templateId: string,
  parametros: string[],
  llevaImagen: boolean,
): Promise<void> {
  await resolverPlantillaEnviable(tenantId, templateId, parametros, llevaImagen);
}

/**
 * `media id` de Meta de la imagen por defecto, con caché en la propia plantilla (HT-WA-04,
 * criterio 13). Todas las campañas y envíos sin reemplazo comparten ese id hasta que vence.
 */
async function asegurarImagenDefecto(
  tenantId: TenantId,
  tpl: LeanWhatsAppTemplate,
): Promise<ICabeceraEnvio | undefined> {
  const imagen = tpl.imagenDefecto;
  if (formatoCabecera(tpl) !== 'IMAGE' || !imagen) return undefined;

  const metaMediaId = await asegurarMetaMediaId(tenantId, imagen, {
    nombreArchivo: `plantilla-${tpl._id.toString()}.${extensionImagen(imagen.mimeType)}`,
    mensajeError: 'No se pudo subir la imagen por defecto de la plantilla a WhatsApp.',
    persistir: async (id, at) => {
      await findOneAndUpdateScoped(
        WhatsAppTemplate,
        tenantId,
        { _id: tpl._id },
        { $set: { 'imagenDefecto.metaMediaId': id, 'imagenDefecto.subidaMetaAt': at } },
      );
    },
  });
  return { tipo: 'image', metaMediaId };
}

/**
 * Deja lista la imagen por defecto de una plantilla para enviar (HT-WA-04). `undefined` si la
 * plantilla no es de imagen o no tiene imagen por defecto.
 *
 * La usa la campaña antes de materializar destinatarios: si Meta no acepta la imagen, falla una vez
 * al lanzar y no en cada destinatario.
 */
export async function prepararImagenPorDefecto(
  tenantId: TenantId,
  templateId: string,
): Promise<ICabeceraEnvio | undefined> {
  // Sin plantilla no hay imagen que preparar: el 404 lo da el envío, que valida la plantilla entera.
  const tpl = await findByIdScoped(WhatsAppTemplate, tenantId, templateId)
    .lean<LeanWhatsAppTemplate | null>()
    .exec();
  return tpl ? asegurarImagenDefecto(tenantId, tpl) : undefined;
}

/**
 * Resuelve la plantilla y construye los `components` de envío posicionales que espera la Graph
 * API. No envía nada: eso es responsabilidad de `message.service.sendOutbound`. Único punto donde
 * se validan los criterios 5 y 6 del spec (estado aprobado y conteo de parámetros).
 *
 * `cabecera` es la imagen de reemplazo (HU-MARK-03). Sin ella, una plantilla de imagen usa su
 * imagen por defecto (HT-WA-04); una sin media en la cabecera da el mismo resultado de siempre.
 */
export async function buildTemplatePayload(
  tenantId: TenantId,
  templateId: string,
  parametros: string[],
  cabecera?: ICabeceraEnvio,
): Promise<{ name: string; langCode: string; components: unknown[] }> {
  const tpl = await resolverPlantillaEnviable(tenantId, templateId, parametros, !!cabecera);
  const imagen = cabecera ?? (await asegurarImagenDefecto(tenantId, tpl));

  const components: unknown[] = [];
  if (imagen) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { id: imagen.metaMediaId } }],
    });
  }
  if (parametros.length > 0) {
    components.push({ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) });
  }

  return { name: tpl.name, langCode: tpl.language, components };
}

/**
 * Imagen por defecto de una plantilla **dentro del tenant**, para servirla por la ruta firmada.
 * Otro tenant o una plantilla sin imagen dan el mismo 404.
 */
export async function resolverImagenPlantilla(
  tenantId: TenantId,
  templateId: string,
): Promise<NonNullable<LeanWhatsAppTemplate['imagenDefecto']>> {
  const tpl = await findByIdScoped(WhatsAppTemplate, tenantId, templateId)
    .lean<LeanWhatsAppTemplate | null>()
    .exec();
  const imagen = tpl?.imagenDefecto;
  if (!imagen) throw new AppError('Imagen no encontrada.', 404);
  return imagen;
}

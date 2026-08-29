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
import { getIntegrationWithToken } from '../channel/channel.service.js';
import { metaTemplateClient } from '../../integrations/meta/meta-template.client.js';
import { WhatsAppTemplate } from './whatsapp-template.model.js';
import type {
  CreateTemplateBody,
  IPlantillaComponente,
  IWhatsAppTemplateDocument,
  IWhatsAppTemplateResponse,
  LeanWhatsAppTemplate,
  ListTemplatesQuery,
  SyncTemplatesResponse,
  WhatsAppTemplatesListResponse,
} from './whatsapp-template.types.js';

type TenantId = string | Types.ObjectId;

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

function bodyComponentOf(components: IPlantillaComponente[]): IPlantillaComponente | undefined {
  return components.find((c) => c.type === 'BODY');
}

function bodyTextOf(components: IPlantillaComponente[]): string | null {
  return bodyComponentOf(components)?.text ?? null;
}

function mapToResponse(doc: LeanWhatsAppTemplate): IWhatsAppTemplateResponse {
  return {
    id: doc._id.toString(),
    name: doc.name,
    language: doc.language,
    category: doc.category,
    status: doc.status,
    cuerpo: bodyTextOf(doc.components),
    ejemplos: bodyComponentOf(doc.components)?.example?.body_text?.[0] ?? [],
    parametrosBody: doc.parametrosBody,
    obsoleta: doc.obsoleta,
    syncedAt: doc.syncedAt.toISOString(),
  };
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

/**
 * Espejo del catálogo real en Meta: crea las nuevas, actualiza el `status` de las existentes y
 * marca `obsoleta: true` las que Meta ya no devuelve (nunca se borran: puede haber `Message`
 * históricos que las referencian). Idempotente — se puede ejecutar tantas veces como haga falta.
 */
export async function syncTemplates(tenantId: TenantId): Promise<SyncTemplatesResponse> {
  const integration = await getIntegrationWithToken(tenantId);
  const remotas = await metaTemplateClient.list(integration.wabaId, integration.accessToken);

  let creadas = 0;
  let actualizadas = 0;
  const vistas: Array<{ name: string; language: string }> = [];

  for (const tpl of remotas) {
    const cuerpo = bodyTextOf(tpl.components);
    const parametrosBody = cuerpo ? derivarParametrosBody(cuerpo) : 0;

    const previa = await findOneScoped(WhatsAppTemplate, tenantId, {
      name: tpl.name,
      language: tpl.language,
    })
      .lean<LeanWhatsAppTemplate | null>()
      .exec();

    await findOneAndUpdateScoped(
      WhatsAppTemplate,
      tenantId,
      { name: tpl.name, language: tpl.language },
      {
        $set: {
          metaTemplateId: tpl.id,
          category: tpl.category,
          status: tpl.status,
          components: tpl.components,
          parametrosBody,
          syncedAt: new Date(),
          obsoleta: false,
        },
      },
      { upsert: true, new: true },
    );

    if (previa) actualizadas++;
    else creadas++;
    vistas.push({ name: tpl.name, language: tpl.language });
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

/**
 * Crea la plantilla en Meta y solo entonces la persiste localmente en `PENDING`: si Meta rechaza
 * la creación, `metaTemplateClient.create` lanza y no queda ningún documento local huérfano.
 */
export async function createTemplate(
  tenantId: TenantId,
  dto: CreateTemplateBody,
): Promise<IWhatsAppTemplateResponse> {
  const parametrosBody = derivarParametrosBody(dto.cuerpo);

  const components: IPlantillaComponente[] = [
    {
      type: 'BODY',
      text: dto.cuerpo,
      ...(dto.ejemplos.length > 0 ? { example: { body_text: [dto.ejemplos] } } : {}),
    },
  ];

  const integration = await getIntegrationWithToken(tenantId);
  const creada = await metaTemplateClient.create(integration.wabaId, integration.accessToken, {
    name: dto.name,
    language: dto.language,
    category: dto.category,
    components,
  });

  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: creada.id,
    name: dto.name,
    language: dto.language,
    category: dto.category,
    status: creada.status,
    components,
    parametrosBody,
    syncedAt: new Date(),
    obsoleta: false,
  });

  return mapToResponse(doc.toObject() as LeanWhatsAppTemplate);
}

/**
 * Resuelve la plantilla y construye los `components` de envío posicionales que espera la Graph
 * API. No envía nada: eso es responsabilidad de `message.service.sendOutbound`. Único punto donde
 * se validan los criterios 5 y 6 del spec (estado aprobado y conteo de parámetros).
 */
export async function buildTemplatePayload(
  tenantId: TenantId,
  templateId: string,
  parametros: string[],
): Promise<{ name: string; langCode: string; components: unknown[] }> {
  const tpl = await findByIdScoped(WhatsAppTemplate, tenantId, templateId)
    .lean<LeanWhatsAppTemplate | null>()
    .exec();
  if (!tpl) throw new AppError('Plantilla no encontrada.', 404);

  if (tpl.status !== 'APPROVED') {
    throw new AppError('La plantilla no está aprobada por Meta.', 422, { status: tpl.status });
  }
  if (parametros.length !== tpl.parametrosBody) {
    throw new AppError('Número de parámetros incorrecto.', 400, {
      esperados: tpl.parametrosBody,
      recibidos: parametros.length,
    });
  }

  const components =
    parametros.length > 0
      ? [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }]
      : [];

  return { name: tpl.name, langCode: tpl.language, components };
}

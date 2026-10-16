/**
 * Backfill HU-MARK-05: recupera el contenido de los mensajes de campaña que se guardaron vacíos.
 *
 * Hasta HU-MARK-05 cada envío de campaña creaba un `Message` con `tipo: 'plantilla'` y nada más:
 * sin texto, sin imagen y sin saber de qué campaña venía. En la bandeja salían como "Mensaje sin
 * contenido". El destinatario de campaña sí guardó el `metaMessageId`, así que la cadena
 * `CampaignRecipient → Campaign → plantilla` permite reconstruir lo que el cliente leyó.
 *
 * Exacto, no aproximado: las campañas anteriores a este feature no tenían variables de contacto,
 * así que sus parámetros eran los mismos para todos y siguen guardados en la campaña.
 *
 * Lo que NO se puede recuperar (y se reporta): plantillas enviadas fuera de una campaña
 * (recordatorios, flujos, envío manual) —nadie guardó con qué parámetros salieron— y campañas o
 * plantillas que ya no existen.
 *
 * También reporta los `metaMessageId` repetidos dentro de un tenant: el índice único que añade
 * HU-MARK-05 no se puede crear mientras existan. **No los borra**: decidir cuál sobra es manual.
 *
 * Idempotente: solo toca mensajes de plantilla sin `texto`; los que rellena ya no vuelven a entrar.
 *
 * Uso:
 *   pnpm --filter @sofiapp/api backfill:mensajes-campana --dry-run
 *   pnpm --filter @sofiapp/api backfill:mensajes-campana
 *
 * Correr el `--dry-run` ANTES de desplegar (por los duplicados) y la versión real después.
 */
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  aggregateScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../repositories/base.repository.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { Message } from '../features/message/message.model.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Campaign } from '../features/campaign/campaign.model.js';
import { CampaignRecipient } from '../features/campaign/campaign-recipient.model.js';
import { WhatsAppTemplate } from '../features/whatsapp-template/whatsapp-template.model.js';
import {
  formatoCabecera,
  renderizarPlantilla,
} from '../features/whatsapp-template/whatsapp-template.service.js';
import { resolverParametros } from '../features/campaign/campaign.parametros.js';
import type { LeanCampaign, LeanCampaignRecipient } from '../features/campaign/campaign.types.js';
import type { LeanWhatsAppTemplate } from '../features/whatsapp-template/whatsapp-template.types.js';

export type MotivoNoRecuperable = 'sin_campana' | 'campana_borrada' | 'plantilla_borrada';

export interface IReporteBackfill {
  candidatos: number;
  recuperados: number;
  noRecuperables: Record<MotivoNoRecuperable, number>;
  /** `metaMessageId` con más de un documento en el tenant: bloquean el índice único. */
  duplicados: string[];
}

interface IMensajeCandidato {
  _id: Types.ObjectId;
  clienteId: Types.ObjectId;
  metaMessageId: string;
  media?: unknown;
}

/** Mensajes de plantilla sin contenido. `texto: null` cubre tanto `null` como el campo ausente. */
const FILTRO_CANDIDATOS = {
  tipo: { $in: ['plantilla', 'template'] },
  texto: null,
  metaMessageId: { $type: 'string' },
};

async function buscarDuplicados(tenantId: Types.ObjectId): Promise<string[]> {
  const filas = await aggregateScoped<{ _id: string }>(Message, tenantId, [
    { $match: { metaMessageId: { $type: 'string' } } },
    { $group: { _id: '$metaMessageId', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  return filas.map((f) => f._id);
}

/**
 * Backfill de UN tenant. Toda lectura y escritura pasa por el repositorio scoped: un script que
 * recorre a todas las empresas es justo donde una consulta sin `tenantId` cruzaría datos.
 */
export async function backfillMensajesCampana(
  tenantId: Types.ObjectId,
  dryRun = false,
): Promise<IReporteBackfill> {
  const reporte: IReporteBackfill = {
    candidatos: 0,
    recuperados: 0,
    noRecuperables: { sin_campana: 0, campana_borrada: 0, plantilla_borrada: 0 },
    duplicados: await buscarDuplicados(tenantId),
  };

  const candidatos = await findScoped(Message, tenantId, FILTRO_CANDIDATOS)
    .select('clienteId metaMessageId media')
    .lean<IMensajeCandidato[]>();
  reporte.candidatos = candidatos.length;

  // Una campaña manda a miles: sin caché, el mismo documento se leería una vez por mensaje.
  const campanas = new Map<string, LeanCampaign | null>();
  const plantillas = new Map<string, LeanWhatsAppTemplate | null>();

  for (const mensaje of candidatos) {
    const destinatario = await findOneScoped(CampaignRecipient, tenantId, {
      metaMessageId: mensaje.metaMessageId,
    }).lean<LeanCampaignRecipient | null>();
    if (!destinatario) {
      reporte.noRecuperables.sin_campana += 1;
      continue;
    }

    const campaignKey = String(destinatario.campaignId);
    if (!campanas.has(campaignKey)) {
      campanas.set(
        campaignKey,
        await findByIdScoped(Campaign, tenantId, campaignKey).lean<LeanCampaign | null>(),
      );
    }
    const campana = campanas.get(campaignKey) ?? null;
    if (!campana) {
      reporte.noRecuperables.campana_borrada += 1;
      continue;
    }

    const templateKey = String(campana.templateId);
    if (!plantillas.has(templateKey)) {
      plantillas.set(
        templateKey,
        await findByIdScoped(WhatsAppTemplate, tenantId, templateKey)
          .lean<LeanWhatsAppTemplate | null>()
          .exec(),
      );
    }
    const plantilla = plantillas.get(templateKey) ?? null;
    if (!plantilla) {
      reporte.noRecuperables.plantilla_borrada += 1;
      continue;
    }

    const dinamicos = campana.parametrosDinamicos ?? [];
    let parametros = campana.parametros;
    if (dinamicos.length > 0) {
      const cliente = await findByIdScoped(Cliente, tenantId, mensaje.clienteId)
        .select('nombre telefono')
        .lean<{ nombre?: string | null; telefono: string } | null>();
      if (cliente) parametros = resolverParametros(campana.parametros, dinamicos, cliente);
    }

    const texto = renderizarPlantilla(plantilla.components, parametros);
    // Misma prioridad que el envío (criterio 3): la imagen propia de la campaña o, si no tenía, la
    // por defecto de la plantilla (HT-WA-04), que es la que Meta puso en la cabecera.
    const imagen =
      campana.contenido?.imagen ??
      (formatoCabecera(plantilla) === 'IMAGE' ? (plantilla.imagenDefecto ?? null) : null);

    reporte.recuperados += 1;
    if (dryRun) continue;

    await findOneAndUpdateScoped(
      Message,
      tenantId,
      // `texto: null` otra vez: si entre la lectura y aquí alguien lo rellenó, no se pisa.
      { _id: mensaje._id, texto: null },
      {
        $set: {
          ...(texto ? { texto } : {}),
          origen: 'campana',
          campaignId: campana._id,
          plantilla: {
            templateId: plantilla._id,
            nombre: plantilla.name,
            idioma: plantilla.language,
            parametros,
          },
          ...(imagen && !mensaje.media
            ? {
                media: {
                  estado: 'disponible',
                  mimeType: imagen.mimeType,
                  mediaKey: imagen.mediaKey,
                  tamanoBytes: imagen.tamanoBytes,
                  ...(imagen.metaMediaId ? { metaMediaId: imagen.metaMediaId } : {}),
                },
              }
            : {}),
        },
      },
    );
  }

  return reporte;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    // Listar empresas es la única lectura global, y solo trae ids: el resto va tenant por tenant.
    const tenants = await Tenant.find({}).select('_id').lean<Array<{ _id: Types.ObjectId }>>();

    for (const { _id: tenantId } of tenants) {
      const reporte = await backfillMensajesCampana(tenantId, dryRun);
      if (reporte.candidatos === 0 && reporte.duplicados.length === 0) continue;

      logger.info(
        dryRun
          ? 'Backfill de mensajes de campaña (simulacro, sin escribir).'
          : 'Backfill de mensajes de campaña.',
        { tenantId: String(tenantId), ...reporte },
      );
      if (reporte.duplicados.length > 0) {
        logger.warn('metaMessageId duplicados: resolverlos antes de crear el índice único.', {
          tenantId: String(tenantId),
          duplicados: reporte.duplicados,
        });
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

// Solo corre como script; importarlo desde un test no dispara el backfill.
if (process.argv[1]?.includes('backfill-mensajes-campana')) {
  main().catch((err: unknown) => {
    logger.error('Backfill de mensajes de campaña fallido.', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}

import { Types } from 'mongoose';
import { TEMPLATE_SYNC_TENANT_JOB, templateQueue } from '../config/queues.js';
import { logger } from '../utils/logger.js';
import { WhatsAppTemplate } from '../features/whatsapp-template/whatsapp-template.model.js';
import {
  aplicarEstadoPlantilla,
  ESTADOS_EN_REVISION,
  syncTemplates,
} from '../features/whatsapp-template/whatsapp-template.service.js';
import type {
  TemplateStatusJobData,
  TemplateSyncTenantJobData,
} from '../features/whatsapp-template/whatsapp-template.types.js';

/** Un evento `message_template_status_update` ya resuelto a su tenant (HT-WA-04, criterio 5). */
export async function processTemplateStatusJob(data: TemplateStatusJobData): Promise<void> {
  await aplicarEstadoPlantilla(data.tenantId, data.metaTemplateId, data.evento, data.motivo);
}

/**
 * Barrido de respaldo (HT-WA-04, criterio 6): encola una sincronización por cada tenant con
 * plantillas en revisión. Cubre el webhook perdido, el campo sin suscribir en el dashboard de Meta y
 * las plantillas creadas mientras el worker estaba caído.
 *
 * **Lectura de sistema sin tenant, documentada**: solo extrae los `tenantId` distintos, igual que el
 * barrido de campañas programadas. Todo lo que pasa después —leer y escribir plantillas— va scoped
 * a cada tenant en `syncTemplates`.
 */
export async function processTemplateSyncSweep(): Promise<number> {
  const tenantIds: Types.ObjectId[] = await WhatsAppTemplate.distinct('tenantId', {
    status: { $in: ESTADOS_EN_REVISION },
    obsoleta: false,
  });

  for (const tenantId of tenantIds) {
    const data: TemplateSyncTenantJobData = { tenantId: tenantId.toString() };
    // `jobId` por tenant: si el barrido anterior aún no terminó con ese tenant, no se duplica.
    await templateQueue.add(TEMPLATE_SYNC_TENANT_JOB, data, {
      jobId: `template-sync-${tenantId.toString()}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  return tenantIds.length;
}

/** Sincroniza el catálogo de un tenant; `syncTemplates` avisa en vivo de cada cambio de estado. */
export async function processTemplateSyncTenant(data: TemplateSyncTenantJobData): Promise<void> {
  try {
    await syncTemplates(data.tenantId);
  } catch (err) {
    // Un tenant sin canal o con el token caducado no debe tumbar el barrido de los demás.
    logger.warn('No se pudo sincronizar las plantillas del tenant', {
      tenantId: data.tenantId,
      error: String(err),
    });
  }
}

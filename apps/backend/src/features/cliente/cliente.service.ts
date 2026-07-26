import { Types } from 'mongoose';
import { findOneAndUpdateScoped, findOneScoped } from '../../repositories/base.repository.js';
import { assertWithinQuota } from '../usage/usage.service.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { Cliente } from './cliente.model.js';
import type { CanalOrigen, IClienteDocument } from './cliente.types.js';

export async function upsertByMetaUser(
  tenantId: string | Types.ObjectId,
  metaUserId: string,
  telefono: string,
  canalOrigen: CanalOrigen,
  nombre?: string,
): Promise<IClienteDocument> {
  const now = new Date();
  const ventana24hExpiraEn = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Cuota de leads (HU-SAAS-02): solo aplica a un lead NUEVO. En el webhook/worker el bloqueo es
  // SUAVE — registramos el exceso pero nunca descartamos un mensaje entrante del cliente.
  const existing = await findOneScoped(Cliente, tenantId, { metaUserId }).lean();
  if (!existing) {
    try {
      await assertWithinQuota(tenantId, 'leads');
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 429) {
        logger.warn('Límite de leads del plan superado (lead admitido de todas formas).', {
          tenantId: tenantId.toString(),
          metaUserId,
        });
      } else {
        throw err;
      }
    }
  }

  const update: Record<string, unknown> = {
    $set: { telefono, ultimoMensajeAt: now, ventana24hExpiraEn },
    $setOnInsert: { metaUserId, canalOrigen, estadoComercial: 'nuevo', customFields: {}, tags: [] },
  };
  if (nombre) (update['$set'] as Record<string, unknown>)['nombre'] = nombre;

  const cliente = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { metaUserId },
    update,
    { upsert: true, new: true },
  );

  if (!cliente) throw new Error('Error interno al crear/actualizar cliente.');
  return cliente as unknown as IClienteDocument;
}

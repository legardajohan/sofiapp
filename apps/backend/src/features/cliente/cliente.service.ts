import { Types } from 'mongoose';
import { findOneAndUpdateScoped } from '../../repositories/base.repository.js';
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

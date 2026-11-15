import { Types, type ClientSession } from 'mongoose';
import { countScoped, findScoped, updateManyScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';

/**
 * Operaciones masivas sobre la asignación de conversaciones (AUTH-03). Viven aparte de
 * `conversation.service` para que `user.service` pueda usarlas sin crear un ciclo de imports
 * (`conversation.service` ya importa `user.service`).
 *
 * "Conversación asignada" = `Cliente` con `asesorId` igual al usuario. `Cliente` no tiene estado
 * cerrada/archivada, así que cuentan todas: ninguna puede quedar apuntando a un usuario inactivo.
 */

type TenantId = string | Types.ObjectId;

export async function countAssignedConversations(
  tenantId: TenantId,
  userId: string,
  session?: ClientSession,
): Promise<number> {
  const q = countScoped(Cliente, tenantId, { asesorId: new Types.ObjectId(userId) });
  return session ? q.session(session) : q;
}

/**
 * Pasa todas las conversaciones de `fromUserId` a `destinoId`, o las deja sin asignar si es
 * `null`. Devuelve los ids movidos (para el evento de tiempo real). La validación del destino
 * (mismo tenant, admin activo) es responsabilidad del llamador: aquí solo se escribe.
 */
export async function moveAssignedConversations(
  tenantId: TenantId,
  fromUserId: string,
  destinoId: string | null,
  session: ClientSession,
): Promise<string[]> {
  const desde = new Types.ObjectId(fromUserId);
  const docs = await findScoped(Cliente, tenantId, { asesorId: desde })
    .select('_id')
    .session(session)
    .lean<{ _id: Types.ObjectId }[]>();
  if (docs.length === 0) return [];

  await updateManyScoped(
    Cliente,
    tenantId,
    { asesorId: desde },
    { asesorId: destinoId ? new Types.ObjectId(destinoId) : null },
  ).session(session);

  return docs.map((d) => String(d._id));
}

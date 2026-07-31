import { Types } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { decryptField, encryptField } from '../../utils/field-crypto.util.js';
import { Cliente } from '../cliente/cliente.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { findUsersByIds } from '../users/user.service.js';
import type { IUserResponse } from '../users/user.types.js';
import type { IPaginated } from '../conversation/conversation.types.js';
import { ContactNote } from './contact-note.model.js';
import type { IContactNoteLean, INotaResponse } from './contact-note.types.js';

type TenantId = string | Types.ObjectId;

function toNotaResponse(
  nota: IContactNoteLean,
  userMap: Map<string, IUserResponse>,
): INotaResponse {
  const autorId = String(nota.autorId);
  return {
    id: String(nota._id),
    texto: decryptField(nota.textoEnc),
    autor: { id: autorId, nombre: userMap.get(autorId)?.nombre ?? null },
    createdAt: nota.createdAt.toISOString(),
  };
}

/**
 * Comprueba que el contacto existe **en este tenant** antes de tocar nada. El `clienteId` viene de
 * la URL y es la única vía por la que un id ajeno podría entrar; `findByIdScoped` devuelve `null`
 * tanto si no existe como si es de otro tenant, y esa indistinguibilidad ES la garantía de
 * aislamiento: nunca un 403, que confirmaría la existencia del recurso ajeno.
 */
async function assertContactoDelTenant(tenantId: TenantId, clienteId: string): Promise<void> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).select({ _id: 1 }).lean();
  if (!cliente) throw new AppError('Contacto no encontrado.', 404);
}

export async function createNota(
  tenantId: TenantId,
  autorId: string,
  clienteId: string,
  texto: string,
): Promise<INotaResponse> {
  await assertContactoDelTenant(tenantId, clienteId);

  const creada = await createScoped(ContactNote, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    autorId: new Types.ObjectId(autorId),
    textoEnc: encryptField(texto),
  });

  // `as unknown as`: `createdAt` lo pone Mongoose vía `timestamps` y no está en `IContactNote`.
  const nota = creada.toObject() as unknown as IContactNoteLean;

  // La bitácora registra que se creó una nota, jamás su contenido: `audit_events` no tiene gate por
  // subrol y volcar ahí el texto dejaría una copia legible de lo que el cifrado protege.
  await recordAuditEvent(tenantId, {
    actorId: autorId,
    accion: 'contact-note.create',
    entidad: 'contact-note',
    entidadId: String(nota._id),
    antes: {},
    despues: { clienteId },
  });

  const userMap = await findUsersByIds(tenantId, [autorId]);
  return toNotaResponse(nota, userMap);
}

/** Notas del contacto, más reciente primero. Apoyada en `{ tenantId, clienteId, createdAt: -1 }`. */
export async function listNotas(
  tenantId: TenantId,
  clienteId: string,
  page: number,
  limit: number,
): Promise<IPaginated<INotaResponse>> {
  await assertContactoDelTenant(tenantId, clienteId);

  const filter = { clienteId: new Types.ObjectId(clienteId) };
  const [docs, total] = await Promise.all([
    findScoped(ContactNote, tenantId, filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IContactNoteLean[]>(),
    countScoped(ContactNote, tenantId, filter),
  ]);

  // Autores en lote: una consulta por página, no una por nota (mismo patrón que HU-OMNI-02).
  const userMap = await findUsersByIds(tenantId, docs.map((d) => String(d.autorId)));

  return { data: docs.map((d) => toNotaResponse(d, userMap)), page, limit, total };
}

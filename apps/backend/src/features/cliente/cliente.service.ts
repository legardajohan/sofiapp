import { Types, type FilterQuery } from 'mongoose';
import {
  countScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { assertWithinQuota } from '../usage/usage.service.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { Cliente } from './cliente.model.js';
import { Message } from '../message/message.model.js';
import type { IMessageDocument } from '../message/message.types.js';
import { toMessageResponse, type IMessageSource } from '../conversation/conversation.mapper.js';
import type {
  CanalOrigen,
  ICliente,
  IClienteDocument,
  IContactCardResponse,
  IContactHistoryResponse,
  IResumenResponse,
} from './cliente.types.js';
import type { HistoryQuery } from './cliente.validation.js';

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

// ─── Historial del contacto (HU-OMNI-03) ────────────────────────────────────────

/** Forma lean del cliente con `createdAt` (de timestamps) para proyectar la ficha. */
interface IClienteLean extends ICliente {
  _id: Types.ObjectId;
  createdAt: Date;
}

function toContactCard(c: IClienteLean): IContactCardResponse {
  return {
    id: String(c._id),
    nombre: c.nombre ?? null,
    telefono: c.telefono,
    canalOrigen: c.canalOrigen,
    estadoComercial: c.estadoComercial,
    nivelInteres: c.nivelInteres ?? null,
    objecionPrincipal: c.objecionPrincipal ?? null,
    rolContacto: c.rolContacto ?? null,
    tags: c.tags ?? [],
    asesorId: c.asesorId ? String(c.asesorId) : null,
    ultimoMensajeAt: c.ultimoMensajeAt ? c.ultimoMensajeAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

/** El resumen queda desactualizado si llegaron mensajes después de generarlo. */
export function toResumenResponse(c: Pick<IClienteLean, 'resumenIA' | 'ultimoMensajeAt'>): IResumenResponse | null {
  if (!c.resumenIA) return null;
  const desactualizado = !!c.ultimoMensajeAt && c.ultimoMensajeAt > c.resumenIA.mensajesHasta;
  return {
    texto: c.resumenIA.texto,
    generadoAt: c.resumenIA.generadoAt.toISOString(),
    desactualizado,
  };
}

/**
 * Ficha del contacto + historial completo de mensajes (paginado, orden ascendente) + estado del
 * resumen. Todo tenant-safe: el cliente se resuelve con `findByIdScoped` (404 si es de otro tenant)
 * y los mensajes con `findScoped` por `{ clienteId }`.
 */
export async function getContactHistory(
  tenantId: string,
  clienteId: string,
  query: HistoryQuery,
): Promise<IContactHistoryResponse> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean<IClienteLean>();
  if (!cliente) throw new AppError('Contacto no encontrado.', 404);

  const { page, limit } = query;
  const filter: FilterQuery<IMessageDocument> = { clienteId: new Types.ObjectId(clienteId) };
  const total = await countScoped(Message, tenantId, filter);

  // Página de mensajes más recientes (desc), invertida a ascendente para pintar el hilo.
  const docs = await findScoped(Message, tenantId, filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const mensajes = docs.reverse().map((m) => toMessageResponse(m as unknown as IMessageSource));

  return {
    contacto: toContactCard(cliente),
    resumen: toResumenResponse(cliente),
    mensajes: { data: mensajes, page, limit, total },
  };
}

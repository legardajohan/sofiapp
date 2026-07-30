import { Types } from 'mongoose';
import {
  createScoped,
  deleteOneScoped,
  findByIdScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { ICliente } from '../cliente/cliente.types.js';
import { findUsersByIds } from '../users/user.service.js';
import type { IUserResponse } from '../users/user.types.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { Lead } from './lead.model.js';
import type {
  CreateLeadDTO,
  ILeadLean,
  ILeadResponse,
  IRefResponse,
  MotivoEliminacionLead,
} from './lead.types.js';

type TenantId = string | Types.ObjectId;

const TELEFONO_DUPLICADO = 'Ya existe un lead con ese teléfono.';

/** Forma lean mínima del contacto que la respuesta del lead necesita. */
interface IContactoLean extends Pick<ICliente, 'nombre' | 'telefono'> {
  _id: Types.ObjectId;
}

/**
 * Solo dígitos. La unicidad por teléfono no puede depender de cómo lo teclee el asesor:
 * `+57 300 111 2233` y `573001112233` son el mismo número y deben colisionar.
 */
export function normalizarTelefono(valor: string): string {
  return valor.replace(/\D/g, '');
}

function toRef(id: Types.ObjectId, userMap: Map<string, IUserResponse>): IRefResponse {
  const key = String(id);
  return { id: key, nombre: userMap.get(key)?.nombre ?? null };
}

function toLeadResponse(
  lead: ILeadLean,
  contacto: IContactoLean,
  userMap: Map<string, IUserResponse>,
): ILeadResponse {
  return {
    id: String(lead._id),
    nombre: lead.nombre,
    telefono: lead.telefono,
    correo: lead.correo ?? null,
    estado: lead.estado,
    contacto: {
      id: String(contacto._id),
      nombre: contacto.nombre ?? null,
      telefono: contacto.telefono,
    },
    responsable: toRef(lead.responsableId, userMap),
    origen: {
      conversacionId: String(lead.origen.conversacionId),
      convertidoPor: toRef(lead.origen.convertidoPor, userMap),
      convertidoAt: lead.origen.convertidoAt.toISOString(),
    },
    createdAt: lead.createdAt.toISOString(),
  };
}

/** El índice `{ tenantId, telefono }` único es lo que produce este error de Mongo. */
function esTelefonoDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Lanza el 409 con el `leadId` que ya ocupa el teléfono, para que la UI pueda enlazarlo en vez de
 * dejar al asesor sin saber qué pasó. Si no se encuentra (carrera con un borrado), el 409 sale sin
 * `details`: el mensaje sigue siendo correcto.
 */
async function conflictoPorTelefono(tenantId: TenantId, telefono: string): Promise<AppError> {
  const existente = await findOneScoped(Lead, tenantId, { telefono }).lean<ILeadLean>();
  return new AppError(
    TELEFONO_DUPLICADO,
    409,
    existente ? { leadId: String(existente._id) } : undefined,
  );
}

/** Resuelve responsable y autor de la conversión en UNA sola consulta. */
async function resolveUsuarios(
  tenantId: TenantId,
  lead: ILeadLean,
): Promise<Map<string, IUserResponse>> {
  return findUsersByIds(tenantId, [
    String(lead.responsableId),
    String(lead.origen.convertidoPor),
  ]);
}

/**
 * Crea un lead a partir de una conversación. Valida TODO antes de escribir: un `clienteId` ajeno o
 * inexistente no debe dejar un lead a medio crear.
 */
export async function createLeadFromConversation(
  tenantId: TenantId,
  actorId: string,
  dto: CreateLeadDTO,
): Promise<ILeadResponse> {
  // El `clienteId` es el único dato del body que referencia otra colección: es por aquí por donde
  // un id de otro tenant podría entrar. `findByIdScoped` devuelve `null` tanto si no existe como si
  // es de otro tenant, y esa indistinguibilidad ES la garantía de aislamiento: nunca un 403, que
  // confirmaría la existencia del recurso ajeno.
  const contacto = await findByIdScoped(Cliente, tenantId, dto.clienteId).lean<IContactoLean>();
  if (!contacto) throw new AppError('Conversación no encontrada.', 404);

  const telefono = normalizarTelefono(dto.telefono);

  const yaExiste = await findOneScoped(Lead, tenantId, { telefono }).lean<ILeadLean>();
  if (yaExiste) throw new AppError(TELEFONO_DUPLICADO, 409, { leadId: String(yaExiste._id) });

  const conversacionOid = new Types.ObjectId(dto.clienteId);
  const actorOid = new Types.ObjectId(actorId);

  let creado;
  try {
    creado = await createScoped(Lead, tenantId, {
      nombre: dto.nombre,
      telefono,
      correo: dto.correo,
      clienteId: conversacionOid,
      estado: 'nuevo',
      responsableId: actorOid,
      origen: {
        tipo: 'conversacion',
        conversacionId: conversacionOid,
        convertidoPor: actorOid,
        convertidoAt: new Date(),
      },
    });
  } catch (err) {
    // Cierra la carrera que la comprobación de arriba no puede cubrir: entre el `find` y el
    // `create` cabe otra petición con el mismo teléfono.
    if (esTelefonoDuplicado(err)) throw await conflictoPorTelefono(tenantId, telefono);
    throw err;
  }

  // `as unknown as`: `createdAt`/`updatedAt` los pone Mongoose vía `timestamps` y no están en
  // `ILead`, así que el documento hidratado no solapa con `ILeadLean` sin el paso por `unknown`.
  const lead = creado.toObject() as unknown as ILeadLean;

  // La auditoría no bloquea la conversión: `recordAuditEvent` traga sus propios errores y los
  // registra en el log. Un fallo del historial no debe costarle el lead al asesor.
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'lead.create',
    entidad: 'lead',
    entidadId: String(lead._id),
    antes: {},
    despues: { clienteId: dto.clienteId, telefono },
  });

  return toLeadResponse(lead, contacto, await resolveUsuarios(tenantId, lead));
}

export async function getLeadById(tenantId: TenantId, leadId: string): Promise<ILeadResponse> {
  const lead = await findByIdScoped(Lead, tenantId, leadId).lean<ILeadLean>();
  if (!lead) throw new AppError('Lead no encontrado.', 404);

  const contacto = await findByIdScoped(
    Cliente,
    tenantId,
    String(lead.clienteId),
  ).lean<IContactoLean>();

  // Un lead sin contacto sería una referencia colgada; hoy no hay borrado de `Cliente`, pero la
  // ficha no debe reventar si algún día lo hay.
  const contactoSeguro: IContactoLean = contacto ?? {
    _id: lead.clienteId,
    nombre: undefined,
    telefono: lead.telefono,
  };

  return toLeadResponse(lead, contactoSeguro, await resolveUsuarios(tenantId, lead));
}

/**
 * Borra un lead que no debió existir (duplicado, spam, prueba, sin respuesta, no interesado).
 *
 * Es un borrado **definitivo**, no un archivado, y esa es la decisión de diseño: los cinco motivos
 * describen leads que nunca debieron ocupar el pipeline, y el índice único `{ tenantId, telefono }`
 * los mantendría bloqueando la reconversión de su propia conversación si sobrevivieran marcados. Un
 * lead legítimo que se pierde NO se borra: se mueve a `estado: 'perdido'`.
 *
 * Lo que no desaparece es el rastro: el `AuditEvent` guarda el lead entero en `antes` y el motivo en
 * `despues`, así que la conversión y su reversión quedan reconstruibles.
 */
export async function deleteLead(
  tenantId: TenantId,
  actorId: string,
  leadId: string,
  motivo: MotivoEliminacionLead,
): Promise<void> {
  // Mismo criterio que `getLeadById`: un id de otro tenant es indistinguible de uno inexistente.
  // Un 403 aquí confirmaría que el lead existe en otra empresa.
  const lead = await findByIdScoped(Lead, tenantId, leadId).lean<ILeadLean>();
  if (!lead) throw new AppError('Lead no encontrado.', 404);

  await deleteOneScoped(Lead, tenantId, { _id: lead._id });

  // Se audita DESPUÉS de borrar: si el borrado falla, no queda un registro afirmando algo que no
  // pasó. Al revés que en la creación, aquí `antes` es el lead completo — es la única copia que
  // sobrevive.
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'lead.delete',
    entidad: 'lead',
    entidadId: String(lead._id),
    antes: {
      nombre: lead.nombre,
      telefono: lead.telefono,
      correo: lead.correo ?? null,
      estado: lead.estado,
      clienteId: String(lead.clienteId),
      responsableId: String(lead.responsableId),
      origen: {
        tipo: lead.origen.tipo,
        conversacionId: String(lead.origen.conversacionId),
        convertidoPor: String(lead.origen.convertidoPor),
        convertidoAt: lead.origen.convertidoAt.toISOString(),
      },
      createdAt: lead.createdAt.toISOString(),
    },
    despues: { motivo },
  });
}

/**
 * Mapa `clienteId → leadId` para saber qué conversaciones ya se convirtieron. UNA consulta para
 * toda la página de bandeja (mismo patrón en lote que `findTagsByIds` / `findUsersByIds`), apoyada
 * en el índice `{ tenantId, clienteId }`. Sin esto la cabecera solo descubriría el duplicado al
 * recibir el 409, que es red de seguridad y no prevención.
 */
export async function findLeadIdsByClientes(
  tenantId: TenantId,
  clienteIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(clienteIds)];
  if (uniqueIds.length === 0) return new Map();

  const docs = await findScoped(Lead, tenantId, {
    clienteId: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
  })
    .select({ _id: 1, clienteId: 1 })
    .lean<Pick<ILeadLean, '_id' | 'clienteId'>[]>();

  const map = new Map<string, string>();
  for (const doc of docs) map.set(String(doc.clienteId), String(doc._id));
  return map;
}

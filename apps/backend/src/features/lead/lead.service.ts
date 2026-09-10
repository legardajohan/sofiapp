import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import {
  countScoped,
  createScoped,
  deleteOneScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Cliente } from '../cliente/cliente.model.js';
import { toResumenResponse } from '../cliente/cliente.mapper.js';
import type { ICliente, IResumenIA } from '../cliente/cliente.types.js';
import type { IPaginated } from '../conversation/conversation.types.js';
import { findTagsByIds } from '../tag/tag.service.js';
import { Tag } from '../tag/tag.model.js';
import type { ITagResponse, SemaforoSlug } from '../tag/tag.types.js';
import { findUsersByIds } from '../users/user.service.js';
import type { IUserResponse } from '../users/user.types.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { Lead } from './lead.model.js';
import { existeEstado } from '../estado/estado.service.js';
import type {
  CreateLeadDTO,
  ILeadDocument,
  ILeadLean,
  ILeadListItemResponse,
  ILeadResponse,
  IRefResponse,
  ListLeadsQuery,
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
  return findUsersByIds(tenantId, [String(lead.responsableId), String(lead.origen.convertidoPor)]);
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

// ─── Listado (HU-CRM-03) ────────────────────────────────────────────────────────

/** Proyección de `Cliente` que el listado necesita para hidratar semáforo y resumen. */
interface IClienteListSource {
  _id: Types.ObjectId;
  tagIds?: Types.ObjectId[];
  resumenIA?: IResumenIA;
  ultimoMensajeAt?: Date;
}

/**
 * Estira una fecha al último instante de su día. `?hasta=2026-08-21` debe incluir un lead creado
 * ese día a las 18:00; sin esto el usuario pediría "hasta hoy" y no vería nada de hoy.
 */
function finDelDia(fecha: Date): Date {
  const fin = new Date(fecha);
  fin.setUTCHours(23, 59, 59, 999);
  return fin;
}

/** Traduce los filtros de la query a un `FilterQuery`. El `tenantId` NO va aquí: lo pone el repo. */
function buildLeadFilter(query: ListLeadsQuery): FilterQuery<ILeadDocument> {
  const filter: FilterQuery<ILeadDocument> = {};

  if (query.estado) filter.estado = query.estado;
  // `asesor` es un userId contra `responsableId`: no existe el rol "Asesor" (AUTH-02).
  if (query.asesor) filter.responsableId = new Types.ObjectId(query.asesor);

  if (query.desde || query.hasta) {
    const rango: { $gte?: Date; $lte?: Date } = {};
    if (query.desde) rango.$gte = query.desde;
    if (query.hasta) rango.$lte = finDelDia(query.hasta);
    filter.createdAt = rango;
  }

  return filter;
}

/**
 * Acota el filtro a los leads cuya **conversación** lleva la etiqueta de semáforo pedida.
 *
 * El semáforo no es un campo del lead: son cuatro etiquetas de sistema aplicadas a `Cliente.tagIds`
 * (`docs/domain.md` §5). Por eso hay que pasar por el cliente. Ambas consultas van por el
 * repositorio scoped, así que el `$in` resultante solo puede contener clientes del propio tenant —
 * es lo que sostiene el aislamiento de este filtro.
 *
 * Devuelve `false` cuando el filtro no puede casar con nada (la etiqueta no existe porque el
 * administrador la borró, o ninguna conversación la lleva). Responder el listado **sin filtrar** en
 * ese caso sería peor que devolver vacío: el usuario pidió acotar y recibiría todo.
 */
async function aplicarFiltroSemaforo(
  tenantId: TenantId,
  filter: FilterQuery<ILeadDocument>,
  semaforo: NonNullable<ListLeadsQuery['semaforo']>,
): Promise<boolean> {
  // Por slug, nunca por nombre: el nombre es editable por el administrador.
  const tag = await findOneScoped(Tag, tenantId, { semaforo })
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId }>();
  if (!tag) return false;

  // Un ObjectId suelto contra un campo array significa "contiene" en Mongo; cubierto por el
  // índice { tenantId, tagIds }.
  const clientes = await findScoped(Cliente, tenantId, { tagIds: tag._id })
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId }[]>();
  if (clientes.length === 0) return false;

  filter.clienteId = { $in: clientes.map((c) => c._id) };
  return true;
}

/** `ITagResponse` ya estrechada a etiqueta de semáforo: evita un `!` al ordenar por slug. */
type ITagSemaforoResponse = ITagResponse & { semaforo: SemaforoSlug };

function toLeadListItemResponse(
  lead: ILeadLean,
  userMap: Map<string, IUserResponse>,
  clienteMap: Map<string, IClienteListSource>,
  tagMap: Map<string, ITagResponse>,
  puedeVerSensibles: boolean,
): ILeadListItemResponse {
  const cliente = clienteMap.get(String(lead.clienteId));

  // TODAS las etiquetas de semáforo de la conversación, no solo una: que las cuatro se usen como
  // excluyentes es una convención, no algo que el modelo imponga, y quedarse con la primera
  // escondía en silencio las demás. Las etiquetas libres (sin slug) no participan.
  //
  // Orden: la aplicada más recientemente PRIMERO, que es la que la tabla pinta como principal.
  // Se deriva del orden de `Cliente.tagIds` (la última del array es la última puesta), por eso se
  // invierte. Salvedad honesta: `setConversationTags` reemplaza el conjunto entero, así que ese
  // orden es el que mandó la UI, no un histórico real de cuándo se aplicó cada una.
  const semaforos = (cliente?.tagIds ?? [])
    .map((id) => tagMap.get(String(id)))
    .filter((tag): tag is ITagSemaforoResponse => !!tag && tag.semaforo !== null)
    .reverse();

  return {
    id: String(lead._id),
    nombre: lead.nombre,
    telefono: lead.telefono,
    correo: lead.correo ?? null,
    estado: lead.estado,
    responsable: toRef(lead.responsableId, userMap),
    conversacionId: String(lead.origen.conversacionId),
    semaforos,
    resumen: cliente ? toResumenResponse(cliente, puedeVerSensibles) : null,
    ultimoMensajeAt: cliente?.ultimoMensajeAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
  };
}

/**
 * Cambia la etapa de un lead (HU-CRM-03).
 *
 * El `estado` se valida contra el **catálogo del tenant**, no contra un enum: las etapas son datos
 * de cada empresa. Una clave que no existe es un `400` y no un guardado silencioso — a diferencia
 * del filtro del listado, donde una clave desconocida solo significa "no hay nada que mostrar",
 * aquí escribiría en el lead un estado que nadie puede resolver.
 */
export async function updateLeadEstado(
  tenantId: TenantId,
  actorId: string,
  leadId: string,
  estado: string,
): Promise<ILeadResponse> {
  // Mismo criterio que `getLeadById`: un id de otro tenant es indistinguible de uno inexistente.
  const lead = await findByIdScoped(Lead, tenantId, leadId).lean<ILeadLean>();
  if (!lead) throw new AppError('Lead no encontrado.', 404);

  if (!(await existeEstado(tenantId, estado))) {
    throw new AppError('Ese estado no existe en el catálogo de la empresa.', 400);
  }

  // Cambiar al estado que ya tiene no es un error, pero tampoco merece auditoría ni escritura.
  if (lead.estado === estado) return getLeadById(tenantId, leadId);

  await findOneAndUpdateScoped(Lead, tenantId, { _id: lead._id }, { $set: { estado } });

  // La transición es información de negocio: saber quién movió un lead a "pagado" —y cuándo— es
  // justo lo que se pregunta cuando las cuentas no cuadran.
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'lead.update',
    entidad: 'lead',
    entidadId: String(lead._id),
    antes: { estado: lead.estado },
    despues: { estado },
  });

  return getLeadById(tenantId, leadId);
}

/**
 * Listado paginado de los leads del tenant, ordenado por lo más reciente. Todos los filtros son
 * opcionales y combinables.
 *
 * Las referencias se resuelven **en lote**: una consulta por colección y página, nunca N+1. No se
 * usa `populate`, que saltaría el repositorio scoped y con él la garantía de aislamiento.
 */
export async function listLeads(
  tenantId: TenantId,
  query: ListLeadsQuery,
  puedeVerSensibles = false,
): Promise<IPaginated<ILeadListItemResponse>> {
  const { page, limit } = query;
  const filter = buildLeadFilter(query);

  // Un `?estado=` que no está en el catálogo de ESTE tenant devuelve página vacía, no un listado
  // sin filtrar: mismo criterio que el semáforo cuya etiqueta se borró. Cubre además el caso de
  // colar la clave de otra empresa, que nunca puede traer datos ajenos.
  if (query.estado && !(await existeEstado(tenantId, query.estado))) {
    return { data: [], page, limit, total: 0 };
  }

  if (query.semaforo && !(await aplicarFiltroSemaforo(tenantId, filter, query.semaforo))) {
    return { data: [], page, limit, total: 0 };
  }

  const [leads, total] = await Promise.all([
    findScoped(Lead, tenantId, filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<ILeadLean[]>(),
    countScoped(Lead, tenantId, filter),
  ]);

  if (leads.length === 0) return { data: [], page, limit, total };

  // Los clientes de la página, con SOLO lo que la tabla pinta: semáforo, resumen y último mensaje.
  const clientes = await findScoped(Cliente, tenantId, {
    _id: { $in: leads.map((l) => l.clienteId) },
  })
    .select({ _id: 1, tagIds: 1, resumenIA: 1, ultimoMensajeAt: 1 })
    .lean<IClienteListSource[]>();

  const clienteMap = new Map(clientes.map((c) => [String(c._id), c]));

  // Responsables y etiquetas de toda la página, una consulta cada uno (mismos helpers en lote que
  // usa la bandeja).
  const [userMap, tagMap] = await Promise.all([
    findUsersByIds(
      tenantId,
      leads.map((l) => String(l.responsableId)),
    ),
    findTagsByIds(
      tenantId,
      clientes.flatMap((c) => (c.tagIds ?? []).map((id) => String(id))),
    ),
  ]);

  return {
    data: leads.map((lead) =>
      toLeadListItemResponse(lead, userMap, clienteMap, tagMap, puedeVerSensibles),
    ),
    page,
    limit,
    total,
  };
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

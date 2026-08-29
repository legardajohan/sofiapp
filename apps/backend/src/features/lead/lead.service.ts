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
import { logger } from '../../utils/logger.js';
import { Cliente } from '../cliente/cliente.model.js';
import { toResumenResponse } from '../cliente/cliente.mapper.js';
import type { ICliente, IResumenIA } from '../cliente/cliente.types.js';
import type { IPaginated } from '../conversation/conversation.types.js';
import { Tag } from '../tag/tag.model.js';
import { SEMAFORO_SLUGS, type SemaforoSlug } from '../tag/tag.types.js';
import { findUsersByIds } from '../users/user.service.js';
import type { IUserResponse } from '../users/user.types.js';
import { listAuditEvents, recordAuditEvent } from '../audit/audit.service.js';
import { Lead } from './lead.model.js';
import { existeEstado } from '../estado/estado.service.js';
import {
  existeSemaforo,
  findSemaforoByKey,
  mapaSemaforos,
} from '../semaforo/semaforo.service.js';
import type { ISemaforoResponse } from '../semaforo/semaforo.types.js';
import type {
  CreateLeadDTO,
  IHistorialSemaforoResponse,
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
  semaforo: ISemaforoResponse | null,
): ILeadResponse {
  return {
    id: String(lead._id),
    nombre: lead.nombre,
    telefono: lead.telefono,
    correo: lead.correo ?? null,
    estado: lead.estado,
    semaforo,
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
      // Un lead nace sin clasificar: poner un semáforo es una decisión del asesor, y arrancarlo en
      // "frío" sería afirmar algo que nadie ha mirado todavía.
      semaforo: null,
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

  // Recién creado: `semaforo` es `null`, así que no hay nada que resolver contra el catálogo.
  return toLeadResponse(lead, contacto, await resolveUsuarios(tenantId, lead), null);
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

  const [userMap, semaforo] = await Promise.all([
    resolveUsuarios(tenantId, lead),
    findSemaforoByKey(tenantId, lead.semaforo),
  ]);

  return toLeadResponse(lead, contactoSeguro, userMap, semaforo);
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
      semaforo: lead.semaforo ?? null,
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

// ─── Semaforización (HU-CRM-04) ─────────────────────────────────────────────────

/** Los cuatro slugs sembrados tienen etiqueta equivalente en la bandeja; los propios del tenant no. */
function esSlugDeBandeja(key: string | null): key is SemaforoSlug {
  return key !== null && (SEMAFORO_SLUGS as readonly string[]).includes(key);
}

/**
 * Alinea la etiqueta de semáforo de la **conversación** con el semáforo del lead (HU-OMNI-04).
 *
 * Va en **un solo sentido**: el lead manda, la bandeja refleja. Sincronizar en ambos exigiría un
 * candado que hoy no existe y abriría carreras entre dos pantallas que se usan a la vez.
 *
 * Es **best-effort** por diseño: el semáforo del lead ya está guardado cuando esto corre, y la
 * etiqueta es un reflejo. Que el administrador la haya borrado —`docs/domain.md` §5 lo permite
 * explícitamente— o que el lead lleve un semáforo propio del tenant, que no tiene etiqueta
 * equivalente, no son errores: la conversación se queda sin chip y ya está.
 */
async function sincronizarTagSemaforo(
  tenantId: TenantId,
  clienteId: Types.ObjectId,
  key: string | null,
): Promise<void> {
  try {
    // Por slug y NUNCA por nombre: el administrador puede renombrar las etiquetas.
    const tags = await findScoped(Tag, tenantId, { semaforo: { $exists: true } })
      .select({ _id: 1, semaforo: 1 })
      .lean<{ _id: Types.ObjectId; semaforo: SemaforoSlug }[]>();

    const destino = esSlugDeBandeja(key) ? tags.find((t) => t.semaforo === key) : undefined;
    const sobrantes = tags.filter((t) => !destino || !t._id.equals(destino._id)).map((t) => t._id);

    // El filtro `semaforo: { $exists: true }` es lo que protege las etiquetas LIBRES del tenant:
    // solo se retiran las de semáforo, nunca las que el administrador creó para otra cosa.
    if (sobrantes.length > 0) {
      await findOneAndUpdateScoped(
        Cliente,
        tenantId,
        { _id: clienteId },
        { $pull: { tagIds: { $in: sobrantes } } },
      );
    }

    if (destino) {
      await findOneAndUpdateScoped(
        Cliente,
        tenantId,
        { _id: clienteId },
        { $addToSet: { tagIds: destino._id } },
      );
    }
  } catch (err) {
    logger.error('No se pudo sincronizar la etiqueta de semáforo de la conversación', {
      clienteId: String(clienteId),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Cambia el semáforo comercial de un lead (HU-CRM-04).
 *
 * El `semaforo` se valida contra el **catálogo del tenant**, no contra un enum: desde que el
 * catálogo es un CRUD, los colores son datos de cada empresa. Una clave que no existe es un `400`
 * y no un guardado silencioso — a diferencia del filtro del listado, donde una clave desconocida
 * solo significa "no hay nada que mostrar", aquí escribiría en el lead un semáforo que nadie puede
 * resolver.
 *
 * El orden de las operaciones es lo que sostiene la garantía: primero se escribe el dato
 * autoritativo, y solo después la auditoría y el reflejo en la bandeja, ninguno de los cuales puede
 * tumbar un cambio que el usuario ya dio por hecho.
 */
export async function updateLeadSemaforo(
  tenantId: TenantId,
  actorId: string,
  leadId: string,
  semaforo: string | null,
): Promise<ILeadResponse> {
  // Mismo criterio que `getLeadById`: un id de otro tenant es indistinguible de uno inexistente.
  const lead = await findByIdScoped(Lead, tenantId, leadId).lean<ILeadLean>();
  if (!lead) throw new AppError('Lead no encontrado.', 404);

  if (semaforo !== null && !(await existeSemaforo(tenantId, semaforo))) {
    throw new AppError('Ese semáforo no existe en el catálogo de la empresa.', 400);
  }

  // Poner el que ya tiene no es un error, pero tampoco merece auditoría ni escritura: llenaría el
  // historial de entradas que no cuentan ningún cambio.
  const actual = lead.semaforo ?? null;
  if (actual === semaforo) return getLeadById(tenantId, leadId);

  await findOneAndUpdateScoped(Lead, tenantId, { _id: lead._id }, { $set: { semaforo } });

  // Quién movió un lead a "venta concretada" —y cuándo— es justo lo que se pregunta cuando las
  // cuentas no cuadran. `recordAuditEvent` no lanza: un fallo aquí no le cuesta el cambio al asesor.
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'lead.semaforo',
    entidad: 'lead',
    entidadId: String(lead._id),
    antes: { semaforo: actual },
    despues: { semaforo },
  });

  await sincronizarTagSemaforo(tenantId, lead.clienteId, semaforo);

  return getLeadById(tenantId, leadId);
}

/**
 * Historial de cambios de semáforo de un lead (HU-CRM-04). Réplica del patrón de `listAssignments`
 * (HU-OMNI-02): valida la propiedad del recurso, lee la bitácora y resuelve los actores en lote.
 *
 * El filtro por `accion` va **en la consulta**, no después: la entidad `lead` acumula también
 * `lead.create`, `lead.update` y `lead.delete`, y descartarlos tras paginar daría un `total` que no
 * corresponde con las filas devueltas.
 */
export async function listHistorialSemaforo(
  tenantId: TenantId,
  leadId: string,
  page: number,
  limit: number,
): Promise<IPaginated<IHistorialSemaforoResponse>> {
  const lead = await findByIdScoped(Lead, tenantId, leadId).select({ _id: 1 }).lean();
  if (!lead) throw new AppError('Lead no encontrado.', 404);

  const { data, total } = await listAuditEvents(
    tenantId,
    'lead',
    leadId,
    page,
    limit,
    'lead.semaforo',
  );

  const userMap = await findUsersByIds(
    tenantId,
    data.map((evt) => evt.actorId),
  );

  return {
    data: data.map((evt) => ({
      id: evt.id,
      de: leerSlug(evt.antes['semaforo']),
      a: leerSlug(evt.despues['semaforo']),
      actor: toRef(new Types.ObjectId(evt.actorId), userMap),
      at: evt.createdAt,
    })),
    page,
    limit,
    total,
  };
}

/** `antes`/`despues` son `Mixed`: lo que no sea una cadena se lee como "sin clasificar". */
function leerSlug(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

// ─── Listado (HU-CRM-03) ────────────────────────────────────────────────────────

/** Proyección de `Cliente` que el listado necesita para hidratar el resumen. */
interface IClienteListSource {
  _id: Types.ObjectId;
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
  // Desde HU-CRM-04 el semáforo es un campo del lead: un match directo cubierto por el índice
  // `{ tenantId, semaforo, createdAt }`, en vez de las dos consultas que costaba resolverlo a
  // través de las etiquetas de la conversación.
  if (query.semaforo) filter.semaforo = query.semaforo;

  if (query.desde || query.hasta) {
    const rango: { $gte?: Date; $lte?: Date } = {};
    if (query.desde) rango.$gte = query.desde;
    if (query.hasta) rango.$lte = finDelDia(query.hasta);
    filter.createdAt = rango;
  }

  return filter;
}

function toLeadListItemResponse(
  lead: ILeadLean,
  userMap: Map<string, IUserResponse>,
  clienteMap: Map<string, IClienteListSource>,
  semaforoMap: Map<string, ISemaforoResponse>,
): ILeadListItemResponse {
  const cliente = clienteMap.get(String(lead.clienteId));

  return {
    id: String(lead._id),
    nombre: lead.nombre,
    telefono: lead.telefono,
    correo: lead.correo ?? null,
    estado: lead.estado,
    semaforo: lead.semaforo ? (semaforoMap.get(lead.semaforo) ?? null) : null,
    responsable: toRef(lead.responsableId, userMap),
    conversacionId: String(lead.origen.conversacionId),
    resumen: cliente ? toResumenResponse(cliente) : null,
    ultimoMensajeAt: cliente?.ultimoMensajeAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
  };
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
): Promise<IPaginated<ILeadListItemResponse>> {
  const { page, limit } = query;
  const filter = buildLeadFilter(query);

  // Un `?estado=` que no está en el catálogo de ESTE tenant devuelve página vacía, no un listado
  // sin filtrar. Cubre además el caso de colar la clave de otra empresa, que nunca puede traer
  // datos ajenos.
  if (query.estado && !(await existeEstado(tenantId, query.estado))) {
    return { data: [], page, limit, total: 0 };
  }

  // Mismo criterio para el semáforo: el usuario pidió acotar, y responder el listado entero sería
  // peor que devolver vacío.
  if (query.semaforo && !(await existeSemaforo(tenantId, query.semaforo))) {
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

  // Los clientes de la página, con SOLO lo que la tabla pinta: resumen y último mensaje. El
  // semáforo ya no sale de aquí (es campo del lead), así que `tagIds` dejó de hacer falta.
  const clientes = await findScoped(Cliente, tenantId, {
    _id: { $in: leads.map((l) => l.clienteId) },
  })
    .select({ _id: 1, resumenIA: 1, ultimoMensajeAt: 1 })
    .lean<IClienteListSource[]>();

  const clienteMap = new Map(clientes.map((c) => [String(c._id), c]));

  // Responsables y catálogo de semáforos de toda la página, una consulta cada uno.
  const [userMap, semaforoMap] = await Promise.all([
    findUsersByIds(
      tenantId,
      leads.map((l) => String(l.responsableId)),
    ),
    mapaSemaforos(tenantId),
  ]);

  return {
    data: leads.map((lead) => toLeadListItemResponse(lead, userMap, clienteMap, semaforoMap)),
    page,
    limit,
    total,
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

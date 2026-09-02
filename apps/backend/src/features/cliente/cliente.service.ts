import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
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
import { env } from '../../config/env.js';
import { Cliente } from './cliente.model.js';
import { Message } from '../message/message.model.js';
import type { IMessageDocument } from '../message/message.types.js';
import { toMessageResponse, type IMessageSource } from '../conversation/conversation.mapper.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import { findTagsByIds } from '../tag/tag.service.js';
import type { ITagResponse } from '../tag/tag.types.js';
import { assertOpcionesValidas } from '../contact-option/contact-option.service.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import {
  fromStoredOptional,
  fromStoredValue,
  toStoredValue,
} from '../../utils/field-crypto.util.js';
import { MASK_VALOR, maskCorreo, maskDocumento } from '../../utils/mask.util.js';
import { findLeadIdsByClientes } from '../lead/lead.service.js';
import type { ChatTurn, SlotSpec } from '../../integrations/llm/llm-provider.types.js';
import type {
  CampoExtraido,
  CanalOrigen,
  IAtributoPersonalizado,
  IAtributoResponse,
  ICliente,
  IClienteDocument,
  IConfirmarExtraccionResponse,
  IContactCardResponse,
  IContactHistoryResponse,
  IDatosExtraidos,
  IDatosExtraidosResponse,
  IResumenResponse,
  TelefonoOrigen,
  UpdateClienteDTO,
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
    $setOnInsert: { metaUserId, canalOrigen, estadoComercial: 'nuevo', customFields: {}, tagIds: [] },
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

/** El valor de un atributo sensible solo sale para quien puede verlo; al resto le llega la máscara. */
function toAtributoResponse(a: IAtributoPersonalizado, puedeVer: boolean): IAtributoResponse {
  const oculto = a.sensible && !puedeVer;
  return {
    key: a.key,
    label: a.label,
    valor: oculto ? MASK_VALOR : a.sensible ? fromStoredValue(a.valor) : a.valor,
    sensible: a.sensible,
    oculto,
  };
}

function toContactCard(
  c: IClienteLean,
  tagMap: Map<string, ITagResponse> = new Map(),
  puedeVerSensibles = false,
  leadId: string | null = null,
): IContactCardResponse {
  // Se resuelve el valor legible primero y se enmascara después: enmascarar un valor heredado aún
  // cifrado no diría nada útil (ni siquiera el dominio del correo), que es justo lo que la máscara
  // pretende conservar.
  const correo = fromStoredOptional(c.correoEnc);
  const documento = fromStoredOptional(c.documentoEnc);

  return {
    id: String(c._id),
    nombre: c.nombre ?? null,
    telefono: c.telefono,
    canalOrigen: c.canalOrigen,
    estadoComercial: c.estadoComercial,
    nivelInteres: c.nivelInteres ?? null,
    objecionPrincipal: c.objecionPrincipal ?? null,
    rolContacto: c.rolContacto ?? null,
    // Un id sin entrada en el mapa es una referencia colgada: se omite en vez de romper la ficha.
    tags: (c.tagIds ?? [])
      .map((id) => tagMap.get(String(id)))
      .filter((t): t is ITagResponse => t !== undefined),
    asesorId: c.asesorId ? String(c.asesorId) : null,
    ultimoMensajeAt: c.ultimoMensajeAt ? c.ultimoMensajeAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    leadId,
    correo: correo === null ? null : puedeVerSensibles ? correo : maskCorreo(correo),
    documento: documento === null ? null : puedeVerSensibles ? documento : maskDocumento(documento),
    atributos: (c.atributos ?? []).map((a) => toAtributoResponse(a, puedeVerSensibles)),
    puedeVerSensibles,
  };
}

/**
 * El resumen queda desactualizado si llegaron mensajes después de generarlo.
 *
 * Desde HU-IA-04 es un **dato sensible** (ADR-0006, enmienda): lo escribe el modelo sobre el
 * transcript completo, así que puede citar en claro el correo o el documento que `toContactCard`
 * enmascara. Y al ser prosa no se puede enmascarar por partes —el mismo argumento con el que
 * ADR-0006 cerró las notas—, así que se omite entero en vez de recortarlo.
 *
 * El default es `false` igual que en `toContactCard` y `toDatosExtraidosResponse`: si mañana
 * aparece un tercer sitio que proyecte el resumen y su autor olvide pasar el permiso, el fallo es
 * ocultar de más, nunca filtrar.
 */
export function toResumenResponse(
  c: Pick<IClienteLean, 'resumenIA' | 'ultimoMensajeAt'>,
  puedeVerSensibles = false,
): IResumenResponse | null {
  if (!c.resumenIA || !puedeVerSensibles) return null;
  const desactualizado = !!c.ultimoMensajeAt && c.ultimoMensajeAt > c.resumenIA.mensajesHasta;
  return {
    texto: c.resumenIA.texto,
    generadoAt: c.resumenIA.generadoAt.toISOString(),
    desactualizado,
  };
}

/**
 * El `correo` extraído por IA se enmascara con la misma regla que el correo manual: es el mismo dato
 * personal y no puede quedar a la vista solo por venir del modelo. `fromStoredOptional` resuelve
 * tanto el valor en claro como una extracción heredada que quedó cifrada, así que no hace falta
 * migrar nada.
 */
export function toDatosExtraidosResponse(
  datos: IDatosExtraidos | undefined,
  puedeVerSensibles = false,
): IDatosExtraidosResponse | null {
  if (!datos) return null;
  const correo = fromStoredOptional(datos.correo);
  return {
    nombreCompleto: datos.nombreCompleto,
    correo: correo === null ? null : puedeVerSensibles ? correo : maskCorreo(correo),
    telefono: datos.telefono,
    // Las extracciones anteriores a este campo solo guardaban lo dictado en la conversación.
    telefonoOrigen: datos.telefonoOrigen ?? 'conversacion',
    // Ausentes en las extracciones anteriores a HU-IA-06: se normalizan aquí para que la UI no
    // tenga que distinguir "nunca se extrajo" de "se extrajo antes de que el campo existiera".
    interes: datos.interes ?? null,
    confirmados: datos.confirmados ?? [],
    extraidoAt: datos.extraidoAt.toISOString(),
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
  puedeVerSensibles = false,
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

  const tagMap = await findTagsByIds(
    tenantId,
    (cliente.tagIds ?? []).map((id) => String(id)),
  );

  // La ficha necesita saber si ya hay lead para pintar su tarjeta en vez de invitar a convertir
  // otra vez (HU-CRM-01).
  const leadId = (await findLeadIdsByClientes(tenantId, [clienteId])).get(clienteId) ?? null;

  return {
    contacto: toContactCard(cliente, tagMap, puedeVerSensibles, leadId),
    resumen: toResumenResponse(cliente, puedeVerSensibles),
    datosExtraidos: toDatosExtraidosResponse(cliente.datosExtraidos, puedeVerSensibles),
    mensajes: { data: mensajes, page, limit, total },
  };
}

// ─── Edición de la ficha del contacto (HU-CRM-02) ───────────────────────────────

/** Lo que el `AuditEvent` guarda en lugar del valor real de un campo sensible. */
const SENSIBLE_MARKER = '[oculto]';

/** Campos simples, no sensibles: van al documento tal cual y a la auditoría con su valor real. */
const CAMPOS_SIMPLES = [
  'nombre',
  'telefono',
  'nivelInteres',
  'objecionPrincipal',
  'rolContacto',
] as const;

/** Campos sensibles y la columna (sufijo `Enc`, hoy en claro) donde se persisten. */
const CAMPOS_SENSIBLES = [
  ['correo', 'correoEnc'],
  ['documento', 'documentoEnc'],
] as const;

/** Proyección de los atributos para la bitácora: los sensibles nunca sueltan su valor. */
function resumirAtributos(atributos: IAtributoPersonalizado[]): Record<string, unknown>[] {
  return atributos.map((a) => ({
    key: a.key,
    label: a.label,
    valor: a.sensible ? SENSIBLE_MARKER : a.valor,
    sensible: a.sensible,
  }));
}

/**
 * ¿El parche toca algo sensible? Además de `correo`/`documento` y de los atributos sensibles que
 * **entran**, cuenta reemplazar la lista de atributos cuando la actual **ya tiene** alguno sensible:
 * `atributos` viaja completo, así que sustituirla es también una forma de borrar un dato protegido.
 */
function tocaDatosSensibles(dto: UpdateClienteDTO, actuales: IAtributoPersonalizado[]): boolean {
  if (dto.correo !== undefined || dto.documento !== undefined) return true;
  if (dto.atributos === undefined) return false;
  return dto.atributos.some((a) => a.sensible) || actuales.some((a) => a.sensible);
}

/**
 * Parche de la ficha del contacto. Es el **primer** camino por el que un humano escribe sobre un
 * `Cliente`: hasta HU-CRM-02 solo lo hacían el webhook de WhatsApp y la extracción por IA.
 *
 * Valida todo antes de escribir y el rechazo por permiso es **todo-o-nada**: si el body mezcla
 * campos sensibles y no sensibles y el usuario no puede con los primeros, no se guarda ninguno. Un
 * guardado parcial dejaría al asesor creyendo que sí se aplicó lo que ve en pantalla.
 */
export async function updateCliente(
  tenantId: string | Types.ObjectId,
  actorId: string,
  clienteId: string,
  dto: UpdateClienteDTO,
  puedeVerSensibles: boolean,
): Promise<IContactCardResponse> {
  // Un id de otro tenant y uno inexistente son indistinguibles a propósito: un 403 confirmaría la
  // existencia del recurso ajeno (`docs/multi-tenancy.md`).
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean<IClienteLean>();
  if (!cliente) throw new AppError('Contacto no encontrado.', 404);

  const atributosActuales = cliente.atributos ?? [];
  if (tocaDatosSensibles(dto, atributosActuales) && !puedeVerSensibles) {
    throw new AppError('No tienes permiso para editar los datos sensibles del contacto.', 403);
  }

  // Interés, objeción y rol dejaron de tener `enum` en el schema (HU-CRM-02: son catálogos que cada
  // empresa administra), así que esta es la comprobación que impide escribir una clave inventada o
  // una de otro tenant. Va ANTES del `$set`, con el resto de validaciones: el parche es
  // todo-o-nada, y una opción inválida no puede dejar guardado medio formulario.
  await assertOpcionesValidas(tenantId, {
    interes: dto.nivelInteres,
    objecion: dto.objecionPrincipal,
    rol: dto.rolContacto,
  });

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, unknown> = {};
  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};

  for (const campo of CAMPOS_SIMPLES) {
    const valor = dto[campo];
    if (valor === undefined) continue;
    antes[campo] = cliente[campo] ?? null;
    despues[campo] = valor;
    if (valor === null) $unset[campo] = '';
    else $set[campo] = valor;
  }

  for (const [campo, columna] of CAMPOS_SENSIBLES) {
    const valor = dto[campo];
    if (valor === undefined) continue;
    // La bitácora registra QUE cambió, nunca a qué: `audit_events` no tiene gate por subrol, así
    // que volcar ahí el antes/después reabriría por detrás el agujero que este feature viene a
    // cerrar.
    antes[campo] = cliente[columna] ? SENSIBLE_MARKER : null;
    despues[campo] = valor === null ? null : SENSIBLE_MARKER;
    if (valor === null) $unset[columna] = '';
    else $set[columna] = toStoredValue(valor);
  }

  if (dto.atributos !== undefined) {
    $set['atributos'] = dto.atributos.map((a) => ({
      key: a.key,
      label: a.label,
      sensible: a.sensible,
      valor: a.sensible ? toStoredValue(a.valor) : a.valor,
    }));
    antes['atributos'] = resumirAtributos(atributosActuales);
    despues['atributos'] = resumirAtributos(dto.atributos);
  }

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update['$set'] = $set;
  if (Object.keys($unset).length > 0) update['$unset'] = $unset;

  const actualizado = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    update,
    { new: true },
  ).lean<IClienteLean>();

  // Solo si otra petición lo borró entre la lectura y la escritura; el 404 sigue siendo correcto.
  if (!actualizado) throw new AppError('Contacto no encontrado.', 404);

  // La auditoría no bloquea la edición: `recordAuditEvent` traga sus propios errores y los loguea.
  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'cliente.update',
    entidad: 'cliente',
    entidadId: clienteId,
    antes,
    despues,
  });

  const tagMap = await findTagsByIds(
    tenantId,
    (actualizado.tagIds ?? []).map((id) => String(id)),
  );

  // La ficha que devuelve la edición es la misma que pinta el panel, así que arrastra `leadId`
  // (HU-CRM-01): sin esto, guardar un dato de contacto haría desaparecer la tarjeta del lead.
  const leadId = (await findLeadIdsByClientes(tenantId, [clienteId])).get(clienteId) ?? null;

  return toContactCard(actualizado, tagMap, puedeVerSensibles, leadId);
}

// ─── Extracción de datos de contacto por IA (HU-OMNI-03) ────────────────────────

/** Tope del campo `interes`: una frase corta, no un párrafo. */
const INTERES_MAX_LEN = 120;

/** Clave del atributo donde aterriza el interés confirmado (HU-IA-06). */
const ATRIBUTO_INTERES = 'interes';

/** Clave del atributo donde aterriza un teléfono dictado en la conversación (HU-IA-06). */
const ATRIBUTO_TELEFONO_ALTERNO = 'telefono-alterno';

/** Mismo tope que `atributosSchema` en la validación: la lista es corta por diseño. */
const MAX_ATRIBUTOS = 30;

/**
 * Campos que se le piden al modelo, convertidos por `GeminiProvider` en el `responseSchema` de
 * salida estructurada. Desde HU-IA-06 **conviven con la plantilla** `extract`, que `AIService.extract`
 * ya inyecta como `systemInstruction`: estas descripciones acotan la forma de cada campo, y la
 * plantilla —editable por el tenant— manda sobre el criterio.
 */
const DATOS_CONTACTO_SLOTS: SlotSpec[] = [
  {
    campo: 'nombreCompleto',
    tipo: 'texto',
    requerido: false,
    descripcion:
      'Nombre y apellidos completos del cliente, tal como aparecen en la conversación. ' +
      'Cadena vacía si nunca los dice.',
  },
  {
    campo: 'correo',
    tipo: 'texto',
    requerido: false,
    descripcion:
      'Dirección de correo electrónico del cliente mencionada en la conversación. ' +
      'Cadena vacía si no aparece ninguna. No la inventes ni la deduzcas del nombre.',
  },
  {
    campo: 'telefono',
    tipo: 'texto',
    requerido: false,
    descripcion:
      'Número de teléfono que el cliente indique dentro del texto de los mensajes. ' +
      'Cadena vacía si no menciona ninguno.',
  },
  {
    campo: 'interes',
    tipo: 'texto',
    requerido: false,
    descripcion:
      'Producto, servicio, plan o programa CONCRETO por el que el cliente pregunta o que dice ' +
      'querer, con sus propias palabras y en una frase corta ("curso pre-ICFES sabatino"). ' +
      'NO es el nivel de interés: "muy interesado", "caliente" o "quiere comprar" no son ' +
      'respuestas válidas. Cadena vacía si no menciona ninguno.',
  },
];

/** Muletillas con las que el modelo suele rellenar un campo que en realidad no encontró. */
const SIN_DATO =
  /^(null|none|n\/?a|-+|desconocid[oa]|no\s+(especificad|proporcionad|disponible|indicad|mencionad)\w*|sin\s+(dato|información|especificar))$/i;

/** Normaliza un campo devuelto por el LLM: recorta y convierte vacíos/muletillas en `null`. */
const textoLlm = z.unknown().transform((valor): string | null => {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' || SIN_DATO.test(limpio) ? null : limpio;
});

/**
 * Saneamiento de la salida del modelo. Es deliberadamente estricto: preferimos devolver `null`
 * antes que un dato inventado, porque el asesor va a actuar sobre esta información.
 */
const datosExtraidosSchema = z.object({
  nombreCompleto: textoLlm,
  correo: textoLlm.transform((v) =>
    v !== null && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v) ? v.toLowerCase() : null,
  ),
  // Al menos 7 dígitos: descarta respuestas como "el mismo" o un número suelto.
  telefono: textoLlm.transform((v) =>
    v !== null && (v.match(/\d/g)?.length ?? 0) >= 7 ? v : null,
  ),
  // Texto libre acotado: es una frase, no un párrafo, y va a caber en una fila de la ficha.
  interes: textoLlm.transform((v) => (v === null ? null : v.slice(0, INTERES_MAX_LEN))),
});

type DatosExtraidosLlm = z.infer<typeof datosExtraidosSchema>;

/**
 * El transcript del que se extrae: los `EXTRACT_MAX_MENSAJES` mensajes de texto más recientes, en
 * orden cronológico. Mismo patrón que `construirHistorial` en el worker.
 *
 * El tope es de HU-IA-06: hasta entonces se cargaba el hilo entero, sin techo de coste ni de
 * ventana de contexto. Solo mensajes con texto: una imagen o un audio no aportan datos extraíbles.
 */
async function historialParaExtraccion(tenantId: string, clienteId: string): Promise<ChatTurn[]> {
  const docs = await findScoped(Message, tenantId, { clienteId: new Types.ObjectId(clienteId) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(env.EXTRACT_MAX_MENSAJES)
    .lean();

  const historial: ChatTurn[] = [];
  for (const m of docs.reverse()) {
    if (!m.texto) continue;
    historial.push({ role: m.sender === 'user' ? 'user' : 'model', content: m.texto });
  }
  return historial;
}

/**
 * Funde la extracción nueva con la anterior. **Nunca borra por olvido del modelo**: si una pasada
 * encontró el correo y la siguiente no lo ve, el correo se conserva. Y un campo ya confirmado
 * mantiene su valor confirmado pase lo que pase — el asesor ya decidió sobre él.
 */
function fusionarExtraccion(
  anterior: IDatosExtraidos | undefined,
  nuevo: DatosExtraidosLlm,
  telefonoWhatsapp: string,
): IDatosExtraidos {
  const confirmados = anterior?.confirmados ?? [];
  const confirmado = (campo: CampoExtraido): boolean => confirmados.includes(campo);

  const nombreCompleto = confirmado('nombreCompleto')
    ? (anterior?.nombreCompleto ?? null)
    : (nuevo.nombreCompleto ?? anterior?.nombreCompleto ?? null);

  // El correo pasa por el mismo camino de persistencia que el correo manual (HU-CRM-02): es el
  // mismo dato personal y queda bajo el mismo gate por subrol al leerlo.
  const correoNuevo = nuevo.correo === null ? null : toStoredValue(nuevo.correo);
  const correo = confirmado('correo')
    ? (anterior?.correo ?? null)
    : (correoNuevo ?? anterior?.correo ?? null);

  const interes = confirmado('interes')
    ? (anterior?.interes ?? null)
    : (nuevo.interes ?? anterior?.interes ?? null);

  // El teléfono nunca queda vacío: si el cliente no dictó ninguno en el chat, usamos el número
  // desde el que escribe, que siempre conocemos. Guardamos el origen para que el asesor sepa si
  // está viendo un dato que el cliente dio (p. ej. un fijo alterno) o su propio WhatsApp.
  let telefono: string;
  let telefonoOrigen: TelefonoOrigen;
  if (confirmado('telefono') && anterior) {
    telefono = anterior.telefono;
    telefonoOrigen = anterior.telefonoOrigen ?? 'conversacion';
  } else if (nuevo.telefono !== null) {
    telefono = nuevo.telefono;
    telefonoOrigen = 'conversacion';
  } else if (anterior && anterior.telefonoOrigen === 'conversacion') {
    // Un teléfono que el cliente dictó y esta pasada no vio tampoco se pierde.
    telefono = anterior.telefono;
    telefonoOrigen = 'conversacion';
  } else {
    telefono = telefonoWhatsapp;
    telefonoOrigen = 'whatsapp';
  }

  return {
    nombreCompleto,
    correo,
    telefono,
    telefonoOrigen,
    interes,
    confirmados,
    confirmadoAt: anterior?.confirmadoAt ?? null,
    confirmadoPor: anterior?.confirmadoPor ?? null,
    extraidoAt: new Date(),
    modelo: env.GEMINI_MODEL,
  };
}

/** ¿Cambió algún valor? Si no, no hay nada que auditar y el evento sería ruido. */
function extraccionCambio(anterior: IDatosExtraidos | undefined, nuevo: IDatosExtraidos): boolean {
  if (!anterior) return true;
  return (
    (anterior.nombreCompleto ?? null) !== nuevo.nombreCompleto ||
    (anterior.correo ?? null) !== nuevo.correo ||
    anterior.telefono !== nuevo.telefono ||
    (anterior.interes ?? null) !== (nuevo.interes ?? null)
  );
}

/**
 * Proyección de la extracción para la bitácora. El correo va como `[oculto]`: `audit_events` no
 * tiene control de acceso por subrol (`docs/data-model.md`), así que no puede llevarlo en claro.
 * El `interes` sí va tal cual — es un dato comercial, no personal.
 */
function resumirExtraccion(datos: IDatosExtraidos | undefined): Record<string, unknown> {
  if (!datos) return {};
  return {
    nombreCompleto: datos.nombreCompleto,
    correo: datos.correo ? SENSIBLE_MARKER : null,
    telefono: datos.telefono,
    interes: datos.interes ?? null,
  };
}

/**
 * El motor de la extracción, compartido por el botón de la ficha y por el worker (HU-IA-06). Los
 * dos caminos leen el mismo transcript acotado, así que dan exactamente el mismo resultado.
 *
 * `actorId` es `null` cuando lo dispara el worker: en la bitácora eso significa «el sistema», el
 * mismo convenio que ya usan el handoff automático y la semaforización.
 */
export async function ejecutarExtraccion(
  tenantId: string,
  clienteId: string,
  actorId: string | null,
): Promise<IDatosExtraidos> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean<IClienteLean>();
  if (!cliente) throw new AppError('Contacto no encontrado.', 404);

  const historial = await historialParaExtraccion(tenantId, clienteId);
  if (historial.length === 0) {
    throw new AppError('No hay mensajes de texto de los que extraer datos.', 422);
  }

  const { data } = await getAIService().extract<DatosExtraidosLlm>({
    tenantId: new Types.ObjectId(tenantId),
    historial,
    camposObjetivo: DATOS_CONTACTO_SLOTS,
    schema: datosExtraidosSchema,
  });

  const anterior = cliente.datosExtraidos;
  const datosExtraidos = fusionarExtraccion(anterior, data, cliente.telefono);

  await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { $set: { datosExtraidos } },
    { new: true },
  );

  // Solo cuando algo cambia: con la extracción automática corriendo por ráfaga, auditar siempre
  // llenaría la colección de eventos idénticos. Mismo criterio que `cliente.semaforo` (HU-IA-05).
  if (extraccionCambio(anterior, datosExtraidos)) {
    await recordAuditEvent(tenantId, {
      actorId,
      accion: 'cliente.extract',
      entidad: 'cliente',
      entidadId: clienteId,
      antes: resumirExtraccion(anterior),
      despues: resumirExtraccion(datosExtraidos),
    });
  }

  return datosExtraidos;
}

/**
 * Extrae los datos de contacto de la conversación con Gemini y los persiste en
 * `Cliente.datosExtraidos`. Este es el camino **bajo demanda** (botón de la ficha); el automático
 * vive en `features/ai/ai-extract.service.ts` y comparte el mismo motor.
 */
export async function extractContactData(
  tenantId: string,
  clienteId: string,
  actorId: string,
  puedeVerSensibles = false,
): Promise<IDatosExtraidosResponse> {
  const datosExtraidos = await ejecutarExtraccion(tenantId, clienteId, actorId);
  // El mapper descifra y enmascara según el permiso: quien no puede ver el correo tampoco lo ve
  // recién extraído.
  return toDatosExtraidosResponse(datosExtraidos, puedeVerSensibles) as IDatosExtraidosResponse;
}

// ─── Confirmar los datos extraídos (HU-IA-06) ───────────────────────────────────

/** Un atributo que la confirmación quiere añadir a la ficha. */
interface AtributoDestino {
  key: string;
  label: string;
  valor: string;
}

/**
 * Pasa a la ficha los datos que la IA propuso. **Merge no destructivo**: cada campo se escribe
 * solo si su destino está vacío. Lo que ya escribió una persona no se toca nunca — se devuelve en
 * `omitidos` para que la UI lo pueda explicar en vez de fingir que lo aplicó.
 *
 * El teléfono jamás pisa `Cliente.telefono`: es la identidad del canal y `upsertByMetaUser` lo
 * resincroniza desde Meta en cada mensaje entrante, así que escribirlo sería una corrección que el
 * siguiente mensaje deshace. Un teléfono dictado en el chat entra como atributo alterno.
 */
export async function confirmarDatosExtraidos(
  tenantId: string,
  actorId: string,
  clienteId: string,
  campos: CampoExtraido[],
  puedeVerSensibles: boolean,
): Promise<IConfirmarExtraccionResponse> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean<IClienteLean>();
  if (!cliente) throw new AppError('Contacto no encontrado.', 404);

  const datos = cliente.datosExtraidos;
  if (!datos) throw new AppError('No hay datos extraídos que confirmar.', 409);

  // ── Validación, ENTERA antes de escribir nada ──
  const valorDe = (campo: CampoExtraido): string | null => {
    if (campo === 'nombreCompleto') return datos.nombreCompleto;
    if (campo === 'correo') return datos.correo ? fromStoredValue(datos.correo) : null;
    if (campo === 'interes') return datos.interes ?? null;
    return datos.telefono;
  };

  for (const campo of campos) {
    if (valorDe(campo) === null) {
      throw new AppError(`La IA no extrajo ningún valor para "${campo}".`, 400);
    }
  }
  if (campos.includes('telefono') && (datos.telefonoOrigen ?? 'conversacion') === 'whatsapp') {
    throw new AppError(
      'Ese teléfono es el número de WhatsApp del contacto: ya está en la ficha.',
      400,
    );
  }
  // Todo o nada, igual que `updateCliente`: sin permiso no se escribe tampoco lo no sensible.
  if (campos.includes('correo') && !puedeVerSensibles) {
    throw new AppError('No tienes permiso para editar los datos sensibles del contacto.', 403);
  }

  // ── Merge no destructivo ──
  const $set: Record<string, unknown> = {};
  const atributos = [...(cliente.atributos ?? [])];
  const tieneAtributo = (key: string): boolean => atributos.some((a) => a.key === key);
  const aplicados: CampoExtraido[] = [];
  const omitidos: CampoExtraido[] = [];

  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};

  const agregarAtributo = (campo: CampoExtraido, destino: AtributoDestino): void => {
    if (tieneAtributo(destino.key) || atributos.length >= MAX_ATRIBUTOS) {
      omitidos.push(campo);
      return;
    }
    atributos.push({ ...destino, sensible: false });
    aplicados.push(campo);
    antes[destino.key] = null;
    despues[destino.key] = destino.valor;
  };

  for (const campo of campos) {
    const valor = valorDe(campo) as string;

    if (campo === 'nombreCompleto') {
      if (cliente.nombre) {
        omitidos.push(campo);
      } else {
        $set['nombre'] = valor;
        aplicados.push(campo);
        antes['nombre'] = null;
        despues['nombre'] = valor;
      }
    } else if (campo === 'correo') {
      if (cliente.correoEnc) {
        omitidos.push(campo);
      } else {
        $set['correoEnc'] = toStoredValue(valor);
        aplicados.push(campo);
        antes['correo'] = null;
        despues['correo'] = SENSIBLE_MARKER;
      }
    } else if (campo === 'interes') {
      agregarAtributo(campo, { key: ATRIBUTO_INTERES, label: 'Interés', valor });
    } else {
      agregarAtributo(campo, {
        key: ATRIBUTO_TELEFONO_ALTERNO,
        label: 'Teléfono alterno',
        valor,
      });
    }
  }

  if (aplicados.some((c) => c === 'interes' || c === 'telefono')) $set['atributos'] = atributos;

  // Solo se marca confirmado lo APLICADO: marcar un campo omitido sería mentir —el dato no está en
  // la ficha— y bloquearía volver a proponerlo si el valor guardado se borra.
  const confirmados = [...new Set([...(datos.confirmados ?? []), ...aplicados])];
  const datosExtraidos: IDatosExtraidos = {
    ...datos,
    confirmados,
    confirmadoAt: aplicados.length > 0 ? new Date() : (datos.confirmadoAt ?? null),
    confirmadoPor: aplicados.length > 0 ? new Types.ObjectId(actorId) : (datos.confirmadoPor ?? null),
  };
  $set['datosExtraidos'] = datosExtraidos;

  const actualizado = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { $set },
    { new: true },
  ).lean<IClienteLean>();

  // Solo si otra petición lo borró entre la lectura y la escritura; el 404 sigue siendo correcto.
  if (!actualizado) throw new AppError('Contacto no encontrado.', 404);

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'cliente.extract-confirm',
    entidad: 'cliente',
    entidadId: clienteId,
    antes,
    despues: { ...despues, aplicados, omitidos },
  });

  const tagMap = await findTagsByIds(
    tenantId,
    (actualizado.tagIds ?? []).map((id) => String(id)),
  );
  const leadId = (await findLeadIdsByClientes(tenantId, [clienteId])).get(clienteId) ?? null;

  return {
    contacto: toContactCard(actualizado, tagMap, puedeVerSensibles, leadId),
    datosExtraidos: toDatosExtraidosResponse(
      datosExtraidos,
      puedeVerSensibles,
    ) as IDatosExtraidosResponse,
    aplicados,
    omitidos,
  };
}

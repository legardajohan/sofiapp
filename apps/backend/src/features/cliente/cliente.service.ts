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
import type { ChatTurn, SlotSpec } from '../../integrations/llm/llm-provider.types.js';
import type {
  CanalOrigen,
  ICliente,
  IClienteDocument,
  IContactCardResponse,
  IContactHistoryResponse,
  IDatosExtraidos,
  IDatosExtraidosResponse,
  IResumenResponse,
  TelefonoOrigen,
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

function toContactCard(
  c: IClienteLean,
  tagMap: Map<string, ITagResponse> = new Map(),
): IContactCardResponse {
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

export function toDatosExtraidosResponse(
  datos: IDatosExtraidos | undefined,
): IDatosExtraidosResponse | null {
  if (!datos) return null;
  return {
    nombreCompleto: datos.nombreCompleto,
    correo: datos.correo,
    telefono: datos.telefono,
    // Las extracciones anteriores a este campo solo guardaban lo dictado en la conversación.
    telefonoOrigen: datos.telefonoOrigen ?? 'conversacion',
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

  return {
    contacto: toContactCard(cliente, tagMap),
    resumen: toResumenResponse(cliente),
    datosExtraidos: toDatosExtraidosResponse(cliente.datosExtraidos),
    mensajes: { data: mensajes, page, limit, total },
  };
}

// ─── Extracción de datos de contacto por IA (HU-OMNI-03) ────────────────────────

/**
 * Campos que se le piden al modelo. Las descripciones SON el prompt efectivo: `AIService.extract`
 * resuelve la plantilla `extract` solo como gate y no la inyecta, así que la instrucción real
 * viaja aquí, convertida por `GeminiProvider` en el `responseSchema` de salida estructurada.
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
});

type DatosExtraidosLlm = z.infer<typeof datosExtraidosSchema>;

/**
 * Extrae nombre completo, correo y teléfono de la conversación con Gemini y los persiste en
 * `Cliente.datosExtraidos`. Síncrono y **solo bajo demanda** (botón de la ficha), igual que el
 * resumen: nada en el worker ni en el webhook lo invoca, para no gastar tokens de más.
 */
export async function extractContactData(
  tenantId: string,
  clienteId: string,
): Promise<IDatosExtraidosResponse> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean<IClienteLean>();
  if (!cliente) throw new AppError('Contacto no encontrado.', 404);

  const docs = await findScoped(Message, tenantId, { clienteId: new Types.ObjectId(clienteId) })
    .sort({ createdAt: 1 })
    .lean();

  // Solo mensajes con texto: una imagen o un audio no aportan datos de contacto extraíbles.
  const historial: ChatTurn[] = [];
  for (const m of docs) {
    if (!m.texto) continue;
    historial.push({ role: m.sender === 'user' ? 'user' : 'model', content: m.texto });
  }
  if (historial.length === 0) {
    throw new AppError('No hay mensajes de texto de los que extraer datos.', 422);
  }

  const { data } = await getAIService().extract<DatosExtraidosLlm>({
    tenantId: new Types.ObjectId(tenantId),
    historial,
    camposObjetivo: DATOS_CONTACTO_SLOTS,
    schema: datosExtraidosSchema,
  });

  // El teléfono nunca queda vacío: si el cliente no dictó ninguno en el chat, usamos el número
  // desde el que escribe, que siempre conocemos. Guardamos el origen para que el asesor sepa si
  // está viendo un dato que el cliente dio (p. ej. un fijo alterno) o su propio WhatsApp.
  const telefonoDictado = data.telefono;
  const telefonoOrigen: TelefonoOrigen = telefonoDictado === null ? 'whatsapp' : 'conversacion';
  const datosExtraidos: IDatosExtraidos = {
    nombreCompleto: data.nombreCompleto,
    correo: data.correo,
    telefono: telefonoDictado ?? cliente.telefono,
    telefonoOrigen,
    extraidoAt: new Date(),
    modelo: env.GEMINI_MODEL,
  };

  await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { datosExtraidos },
    { new: true },
  );

  return {
    nombreCompleto: datosExtraidos.nombreCompleto,
    correo: datosExtraidos.correo,
    telefono: datosExtraidos.telefono,
    telefonoOrigen,
    extraidoAt: datosExtraidos.extraidoAt.toISOString(),
  };
}

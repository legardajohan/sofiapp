import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  createScoped,
  deleteManyScoped,
  deleteOneScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { responderAutomaticamente } from '../../workers/inbound-message.processor.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import { notifyInboundMessage } from '../conversation/conversation.service.js';
import { toMessageResponse, type IMessageSource } from '../conversation/conversation.mapper.js';
import { Flow, FlowState } from '../flow/flow.model.js';
import { reanudarFlujo } from '../flow/flow.runtime.service.js';
import { getActiveFlow } from '../flow/flow.service.js';
import type { IFlowLean, IFlowState } from '../flow/flow.types.js';
import { Lead } from '../lead/lead.model.js';
import { clasificarTexto } from '../media/media.service.js';
import { Message } from '../message/message.model.js';
import { saveMessage } from '../message/message.service.js';
import { ContactNote } from '../contact-note/contact-note.model.js';
import { Notification } from '../notification/notification.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { findUsersByIds } from '../users/user.service.js';
import {
  PREFIJO_CLIENTE_PRUEBA,
  PREFIJO_MENSAJE_PRUEBA,
  SANDBOX_TTL_DIAS,
  type ISandboxFlujoRef,
  type ISandboxSessionResponse,
} from './sandbox.types.js';

type TenantId = string | Types.ObjectId;

/** Cuántos mensajes de la sesión se devuelven. Una prueba larga no necesita todo el historial. */
const MENSAJES_MAX = 200;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Fila lean del cliente de prueba con su `_id`. */
type ClientePruebaLean = IClienteDocument & { _id: Types.ObjectId };

/**
 * Teléfono ficticio y estable del cliente de prueba, derivado del admin. Lleva el prefijo `999`, que
 * no es un código de país real, así que no choca con el número de un lead de verdad (el índice
 * `{ tenantId, telefono }` de `Lead` es único): 12 dígitos como un móvil colombiano con prefijo.
 */
export function telefonoDePrueba(userId: string): string {
  const resto = parseInt(userId.slice(-8), 16) % 1_000_000_000;
  return `999${String(resto).padStart(9, '0')}`;
}

function esClaveDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

async function buscarClientePrueba(
  tenantId: TenantId,
  userId: string,
): Promise<ClientePruebaLean | null> {
  return findOneScoped(Cliente, tenantId, {
    esPrueba: true,
    pruebaOwnerId: new Types.ObjectId(userId),
  }).lean<ClientePruebaLean | null>();
}

/**
 * El cliente de prueba del admin, creándolo si no existe. Idempotente: el índice único parcial
 * `{ tenantId, pruebaOwnerId }` resuelve la carrera de dos pestañas abriendo la sesión a la vez.
 */
async function obtenerOCrearClientePrueba(
  tenantId: TenantId,
  userId: string,
): Promise<ClientePruebaLean> {
  const existente = await buscarClientePrueba(tenantId, userId);
  if (existente) return existente;

  const nombre = (await findUsersByIds(tenantId.toString(), [userId])).get(userId)?.nombre;
  const ahora = new Date();
  try {
    const creado = await createScoped(Cliente, tenantId, {
      metaUserId: `${PREFIJO_CLIENTE_PRUEBA}${userId}`,
      telefono: telefonoDePrueba(userId),
      nombre: `Prueba${nombre ? ` · ${nombre}` : ''}`,
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      // La ventana de 24 h no se consulta en la prueba, pero algunos módulos (recordatorios, flujo)
      // la leen; dejarla abierta evita ramas especiales.
      ventana24hExpiraEn: new Date(ahora.getTime() + DIA_MS),
      ultimoMensajeAt: ahora,
      iaHabilitada: true,
      noLeidos: 0,
      handoffAt: null,
      handoffMotivo: null,
      customFields: {},
      tagIds: [],
      atributos: [],
      marketingOptOut: false,
      esPrueba: true,
      pruebaOwnerId: new Types.ObjectId(userId),
      pruebaFlowId: null,
      pruebaUltimaActividad: ahora,
    });
    return creado.toObject() as unknown as ClientePruebaLean;
  } catch (err: unknown) {
    if (!esClaveDuplicada(err)) throw err;
    const ganador = await buscarClientePrueba(tenantId, userId);
    if (!ganador) throw err;
    return ganador;
  }
}

async function exigirClientePrueba(tenantId: TenantId, userId: string): Promise<ClientePruebaLean> {
  const cliente = await buscarClientePrueba(tenantId, userId);
  if (!cliente) throw new AppError('No hay una conversación de prueba abierta.', 404);
  return cliente;
}

function refDeFlujo(flow: Pick<IFlowLean, '_id' | 'nombre' | 'activo'>): ISandboxFlujoRef {
  return { id: String(flow._id), nombre: flow.nombre, activo: flow.activo };
}

/** Proyecta la sesión completa: cliente de prueba, flujo, espera pendiente e hilo. */
async function proyectarSesion(
  tenantId: TenantId,
  cliente: ClientePruebaLean,
): Promise<ISandboxSessionResponse> {
  const [elegido, activo, estado, mensajes] = await Promise.all([
    cliente.pruebaFlowId
      ? findByIdScoped(Flow, tenantId, String(cliente.pruebaFlowId)).lean<IFlowLean | null>()
      : Promise.resolve(null),
    getActiveFlow(tenantId),
    findOneScoped(FlowState, tenantId, { clienteId: cliente._id }).lean<IFlowState | null>(),
    findScoped(Message, tenantId, { clienteId: cliente._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(MENSAJES_MAX)
      .lean<IMessageSource[]>(),
  ]);

  const espera = estado?.esperaToken && estado.esperaHasta ? estado.esperaHasta : null;

  return {
    clienteId: String(cliente._id),
    flujo: elegido ? refDeFlujo(elegido) : null,
    flujoActivo: activo ? { id: String(activo._id), nombre: activo.nombre } : null,
    iaHabilitada: cliente.iaHabilitada,
    esperaPendiente: espera ? { hasta: espera.toISOString() } : null,
    mensajes: mensajes.reverse().map((m) => toMessageResponse(m, String(tenantId))),
  };
}

/** Abre (o recupera) la conversación de prueba del admin. */
export async function obtenerSesion(
  tenantId: TenantId,
  userId: string,
): Promise<ISandboxSessionResponse> {
  return proyectarSesion(tenantId, await obtenerOCrearClientePrueba(tenantId, userId));
}

export interface IEnvioPrueba {
  /** El mensaje del admin, ya guardado. */
  mensaje: ISandboxSessionResponse['mensajes'][number];
  /**
   * La respuesta automática en curso (flujo o Sofi). Nunca rechaza: sus fallos se registran. El
   * controller responde 202 sin esperarla; los tests sí la esperan.
   */
  trabajo: Promise<void>;
}

/**
 * El admin escribe "como si fuera el cliente". Pasa por la **misma** decisión flujo-vs-Sofi que un
 * mensaje de WhatsApp (`responderAutomaticamente`); lo único propio de aquí es que el mensaje nace
 * de un formulario y no de un webhook.
 */
export async function enviarMensajePrueba(
  tenantId: TenantId,
  userId: string,
  texto: string,
): Promise<IEnvioPrueba> {
  const cliente = await obtenerOCrearClientePrueba(tenantId, userId);
  const clienteId = String(cliente._id);

  const clasificado = clasificarTexto(texto);
  const { message } = await saveMessage(tenantId, {
    tenantId: new Types.ObjectId(String(tenantId)),
    clienteId: cliente._id,
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: clasificado?.tipo ?? 'texto',
    texto,
    ...(clasificado?.previewEnlace ? { previewEnlace: clasificado.previewEnlace } : {}),
    // El prefijo marca el mensaje como de prueba para quien lea `messages` sin pasar por el cliente.
    metaMessageId: `${PREFIJO_MENSAJE_PRUEBA}in-${randomUUID()}`,
    status: 'sent',
  });

  const ahora = new Date();
  await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: cliente._id },
    {
      $set: {
        ultimoMensajeAt: ahora,
        ventana24hExpiraEn: new Date(ahora.getTime() + DIA_MS),
        pruebaUltimaActividad: ahora,
      },
    },
  );

  const source = message as unknown as IMessageSource;
  await notifyInboundMessage(String(tenantId), clienteId, source);

  const trabajo = cliente.iaHabilitada
    ? responderAutomaticamente(String(tenantId), clienteId, {
        tipo: 'text',
        texto,
        mensajeId: String(message.metaMessageId),
      }).catch((err: unknown) => {
        logger.error('Chat de prueba: la respuesta automática falló', {
          tenantId: String(tenantId),
          clienteId,
          error: String(err),
        });
      })
    : Promise.resolve();

  return { mensaje: toMessageResponse(source, String(tenantId)), trabajo };
}

/**
 * Elige el flujo a probar (`null` = el activo del tenant). Cambiar de flujo empieza el guion de cero y
 * devuelve la palabra a Sofi: tras una transferencia la prueba quedaría muda sin esto.
 */
export async function seleccionarFlujo(
  tenantId: TenantId,
  userId: string,
  flowId: string | null,
): Promise<ISandboxSessionResponse> {
  // `findByIdScoped` devuelve `null` tanto si no existe como si es de otro tenant: nunca un 403.
  if (flowId) {
    const flujo = await findByIdScoped(Flow, tenantId, flowId).select({ _id: 1 }).lean();
    if (!flujo) throw new AppError('Flujo no encontrado.', 404);
  }

  const cliente = await obtenerOCrearClientePrueba(tenantId, userId);
  await deleteManyScoped(FlowState, tenantId, { clienteId: cliente._id });
  await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: cliente._id },
    {
      $set: {
        pruebaFlowId: flowId ? new Types.ObjectId(flowId) : null,
        iaHabilitada: true,
        pruebaUltimaActividad: new Date(),
      },
      $unset: { handoffAt: '', handoffMotivo: '', handoffCondicion: '' },
    },
  );

  return proyectarSesion(tenantId, await exigirClientePrueba(tenantId, userId));
}

/**
 * Borra en cascada un cliente de prueba y todo lo que colgó de él. Los jobs encolados (`ai-reply`,
 * `flow-runtime`) no se cancelan: al despertar no encuentran el cliente y salen sin efecto, y la
 * siguiente sesión nace con un `_id` nuevo que nunca coincide con el de un job viejo.
 */
async function borrarClientePrueba(tenantId: TenantId, clienteId: Types.ObjectId): Promise<void> {
  const leads = await findScoped(Lead, tenantId, { clienteId, esPrueba: true })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();
  const entidades = [clienteId, ...leads.map((l) => l._id)];

  await Promise.all([
    deleteManyScoped(Message, tenantId, { clienteId }),
    deleteManyScoped(FlowState, tenantId, { clienteId }),
    deleteManyScoped(ContactNote, tenantId, { clienteId }),
    deleteManyScoped(Notification, tenantId, { conversacionId: clienteId }),
    deleteManyScoped(AuditEvent, tenantId, { entidadId: { $in: entidades } }),
    deleteManyScoped(Lead, tenantId, { clienteId, esPrueba: true }),
  ]);
  await deleteOneScoped(Cliente, tenantId, { _id: clienteId, esPrueba: true });
}

/** "Reiniciar": borra la conversación de prueba y devuelve una sesión limpia, como un contacto nuevo. */
export async function reiniciarSesion(
  tenantId: TenantId,
  userId: string,
): Promise<ISandboxSessionResponse> {
  const cliente = await buscarClientePrueba(tenantId, userId);
  if (cliente) await borrarClientePrueba(tenantId, cliente._id);
  return obtenerSesion(tenantId, userId);
}

/**
 * «Avanzar ahora» en un nodo `espera`: reanuda con la misma semántica que el job diferido. Cuando ese
 * job venza, `reanudarFlujo` lo descarta porque el token ya no coincide.
 */
export async function avanzarEspera(tenantId: TenantId, userId: string): Promise<void> {
  const cliente = await exigirClientePrueba(tenantId, userId);
  const estado = await findOneScoped(FlowState, tenantId, { clienteId: cliente._id }).lean<IFlowState | null>();
  if (!estado?.esperaToken) throw new AppError('No hay una espera pendiente.', 409);

  await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: cliente._id },
    { $set: { pruebaUltimaActividad: new Date() } },
  );
  await reanudarFlujo(String(tenantId), String(cliente._id), estado.esperaToken);
}

/**
 * Borra las conversaciones de prueba sin actividad en `SANDBOX_TTL_DIAS` días.
 *
 * **Excepción cross-tenant documentada** (junto a `buscarCandidatos` y el webhook de Meta): un único
 * barrido para toda la plataforma. Solo lee el par `(tenantId, _id)`; a partir de ahí todo el borrado
 * pasa por `*Scoped` con el `tenantId` de cada fila.
 */
export async function barrerSesionesInactivas(ahora: Date): Promise<number> {
  const corte = new Date(ahora.getTime() - SANDBOX_TTL_DIAS * DIA_MS);
  const filas = await Cliente.find(
    { esPrueba: true, pruebaUltimaActividad: { $lt: corte } },
    { tenantId: 1 },
  ).lean<Array<{ _id: Types.ObjectId; tenantId: Types.ObjectId }>>();

  for (const fila of filas) {
    await borrarClientePrueba(fila.tenantId, fila._id);
  }
  return filas.length;
}

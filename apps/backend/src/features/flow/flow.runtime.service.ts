import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { findByIdScoped, findOneAndUpdateScoped, findOneScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import { FLOW_RESUME_JOB, flowRuntimeQueue } from '../../config/queues.js';
import type { ChatTurn, SlotSpec } from '../../integrations/llm/llm-provider.types.js';
import { Cliente } from '../cliente/cliente.model.js';
import { createLeadFromConversation } from '../lead/lead.service.js';
import { assignConversation, setConversationTags, setIaHabilitada } from '../conversation/conversation.service.js';
import { sendOutbound } from '../message/message.service.js';
import { Message } from '../message/message.model.js';
import type { IMessage } from '../message/message.types.js';
import { searchKnowledge } from '../kb/kb.retrieval.service.js';
import { avanzar } from './flow.engine.js';
import { getActiveFlow } from './flow.service.js';
import { FlowState } from './flow.model.js';
import type { Efecto, EntradaMotor, IFlowLean, IFlowState, ISalidaIa, RequiereMotor, SalidaMotor } from './flow.types.js';

type TenantId = string | Types.ObjectId;

/** Cuántos turnos de historial real le llegan al nodo `ia` como contexto (HU-FLOW-03). Constante
 *  del módulo, no una env var: no es algo que se ajuste por despliegue. */
const TURNOS_HISTORIAL = 20;

/** Últimos `limite` mensajes de la conversación como `ChatTurn[]`, del más antiguo al más nuevo.
 *  Solo la usa el caso `'ia'`: `intencion`, `kb` y `captura` se quedan con su historial de un
 *  turno — cambiarlo alteraría el comportamiento ya probado de HU-FLOW-01. */
async function construirHistorial(
  tenantId: TenantId,
  clienteId: string,
  limite: number,
): Promise<ChatTurn[]> {
  const mensajes = await findScoped(Message, tenantId, { clienteId: new Types.ObjectId(clienteId) })
    .sort({ createdAt: -1 })
    .limit(limite)
    .lean<IMessage[]>();

  return mensajes
    .reverse()
    .filter((m) => m.texto)
    .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.texto! }) as ChatTurn);
}

/**
 * Actor sintético para las auditorías que disparan los efectos `crear_lead`/`asignar_asesor` del
 * motor de flujos: no hay un usuario humano detrás. `recordAuditEvent` no valida que `actorId`
 * resuelva a un `User` real (`findUsersByIds` simplemente no lo encuentra), así que el evento queda
 * igual de trazable — solo sin nombre de asesor.
 */
const ACTOR_SISTEMA_FLUJO = '000000000000000000000000';

/** Tope de rondas `requiere` → resolver → reentrar dentro de una sola llamada. Cubre la cadena
 *  real (intención, o kb, o una captura ya respondida) sin arriesgarse a un bucle infinito si el
 *  motor pidiera lo mismo una y otra vez por un flujo mal configurado. */
const TOPE_RESOLUCIONES = 5;

async function resolverRequiere(
  tenantId: TenantId,
  clienteId: string,
  requiere: RequiereMotor,
  mensajeCliente: string,
): Promise<NonNullable<EntradaMotor['resueltos']>> {
  const ai = getAIService();
  const tenantOid = tenantId instanceof Types.ObjectId ? tenantId : new Types.ObjectId(tenantId);
  const historial: ChatTurn[] = [{ role: 'user', content: mensajeCliente }];

  if (requiere.tipo === 'intencion') {
    const etiquetas = requiere.etiquetas as [string, ...string[]];
    const schema = z.object({ intencion: z.enum(etiquetas) });
    const slots: SlotSpec[] = [
      {
        campo: 'intencion',
        tipo: 'texto',
        requerido: true,
        descripcion: `Clasifica el mensaje del cliente en UNA de estas etiquetas: ${requiere.etiquetas.join(', ')}.`,
      },
    ];
    const { data } = await ai.extract<{ intencion: string }>({
      tenantId: tenantOid,
      historial,
      schema,
      camposObjetivo: slots,
    });
    return { intencion: data.intencion };
  }

  if (requiere.tipo === 'kb') {
    const { data } = await ai.chat({
      tenantId: tenantOid,
      historial: [{ role: 'user', content: requiere.pregunta }],
    });
    return { respuestaKb: data };
  }

  if (requiere.tipo === 'ia') {
    const historialReal = await construirHistorial(tenantId, clienteId, TURNOS_HISTORIAL);
    const contexto = requiere.usarKb
      ? (await searchKnowledge(tenantId, mensajeCliente)).map((c) => c.texto).join('\n---\n')
      : '';

    const salidas: ISalidaIa[] = requiere.salidas;
    const etiquetas = salidas.map((s) => s.etiqueta) as [string, ...string[]];
    const schema = z.object({
      respuesta: z.string(),
      // `extractSlots` deja vacío lo que no encuentra; '' significa "aún no puedo decidir".
      salida: z
        .union([z.enum(etiquetas), z.literal('')])
        .transform((v) => (v ? v : null)),
    });

    const { data } = await ai.extract<{ respuesta: string; salida: string | null }>({
      tenantId: tenantOid,
      historial: contexto
        ? [...historialReal, { role: 'user', content: `Contexto:\n${contexto}` }]
        : historialReal,
      schema,
      camposObjetivo: [
        {
          campo: 'respuesta',
          tipo: 'texto',
          requerido: true,
          descripcion: `Redacta el siguiente mensaje para el cliente. Objetivo: ${requiere.objetivo}`,
        },
        {
          campo: 'salida',
          tipo: 'texto',
          requerido: false,
          descripcion: `Si ya se cumplió una de estas condiciones, devuelve su nombre; si ninguna, déjalo vacío. ${salidas
            .map((s) => `"${s.etiqueta}": ${s.descripcion}`)
            .join(' | ')}`,
        },
      ],
    });
    return { ia: data };
  }

  // 'captura'
  const schema = z.record(z.string(), z.unknown());
  const { data } = await ai.extract<Record<string, unknown>>({
    tenantId: tenantOid,
    historial,
    schema,
    camposObjetivo: [requiere.spec],
  });
  return { capturado: data[requiere.spec.campo] };
}

/** Ejecuta un efecto y traga su propio error: un nodo mal configurado no puede tumbar el resto de
 *  efectos de la misma pasada ni la persistencia del `FlowState`. Queda registrado en el log. */
async function ejecutarEfecto(tenantId: TenantId, clienteId: string, efecto: Efecto): Promise<void> {
  try {
    switch (efecto.tipo) {
      case 'enviar_mensaje': {
        if (efecto.templateId) {
          await sendOutbound(
            tenantId,
            clienteId,
            { modo: 'plantilla', templateId: efecto.templateId, parametros: efecto.parametros ?? [] },
            'bot',
          );
        } else if (efecto.texto) {
          await sendOutbound(tenantId, clienteId, { modo: 'auto', texto: efecto.texto }, 'bot');
        }
        return;
      }
      case 'cambiar_estado':
        await findOneAndUpdateScoped(
          Cliente,
          tenantId,
          { _id: new Types.ObjectId(clienteId) },
          { estadoComercial: efecto.estado },
        );
        return;
      case 'aplicar_etiquetas': {
        const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
        const actuales = (cliente?.tagIds ?? []).map((id) => String(id));
        const combinadas = [...new Set([...actuales, ...efecto.tagIds])];
        await setConversationTags(tenantId.toString(), clienteId, combinadas);
        return;
      }
      case 'crear_lead': {
        const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
        if (!cliente) return;
        try {
          await createLeadFromConversation(tenantId, ACTOR_SISTEMA_FLUJO, {
            nombre: cliente.nombre ?? cliente.telefono,
            telefono: cliente.telefono,
            clienteId,
          });
        } catch (err) {
          // Ya convertido (409 por teléfono duplicado): no es un fallo del flujo, es idempotencia.
          if (!(err instanceof AppError && err.statusCode === 409)) throw err;
        }
        return;
      }
      case 'asignar_asesor':
        await assignConversation(tenantId.toString(), ACTOR_SISTEMA_FLUJO, clienteId, efecto.asesorId);
        return;
      case 'handoff':
        await setIaHabilitada(tenantId.toString(), clienteId, false);
        return;
      case 'programar_espera':
        // Se intercepta en `correrMotor` ANTES de llegar aquí: necesita devolver el token que
        // genera para que `persistirFlowState` lo escriba en el mismo `$set`, algo que este
        // switch fire-and-forget no puede comunicar de vuelta. Si llega hasta aquí es un fallo de
        // cableado, no un caso de negocio.
        logger.error('programar_espera llegó a ejecutarEfecto sin interceptar', {
          tenantId: tenantId.toString(),
          clienteId,
        });
        return;
      case 'error':
        logger.error('El motor de flujos devolvió un efecto de error', {
          tenantId: tenantId.toString(),
          clienteId,
          mensaje: efecto.mensaje,
        });
        return;
    }
  } catch (err) {
    logger.error('Fallo ejecutando un efecto del flujo (no propaga)', {
      tenantId: tenantId.toString(),
      clienteId,
      efecto: efecto.tipo,
      error: String(err),
    });
  }
}

/** Delay entre reintentos de un job diferido de `flow-runtime`. El envío pega contra la Graph API,
 *  así que un backoff exponencial modesto es preferible a martillar en caso de fallo transitorio. */
const RESUME_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 1000,
};

async function persistirFlowState(
  tenantId: TenantId,
  clienteId: string,
  flow: IFlowLean,
  salida: SalidaMotor,
  metaMessageId?: string,
  esperaToken?: string,
): Promise<void> {
  await findOneAndUpdateScoped(
    FlowState,
    tenantId,
    { clienteId: new Types.ObjectId(clienteId), flowId: flow._id },
    {
      $set: {
        nodoActualId: salida.nodoSiguiente ?? flow.entrada,
        variables: salida.variables,
        esperandoRespuesta: salida.esperandoRespuesta,
        // Decide el estado COMPLETO del token en cada persistencia: uno fresco si esta pasada
        // acaba de programar una espera, o `null` en cualquier otro avance — lo que invalida de
        // paso cualquier job diferido que hubiera quedado pendiente de un nodo `espera` anterior
        // (criterio 3 de HU-FLOW-02).
        esperaToken: esperaToken ?? null,
        actualizadoAt: new Date(),
        ...(metaMessageId ? { ultimoMetaMessageId: metaMessageId } : {}),
      },
    },
    { upsert: true, new: true },
  );
}

/**
 * Núcleo compartido entre `ejecutarFlujo` (mensaje entrante) y `reanudarFlujo` (job diferido de un
 * nodo `espera`, HU-FLOW-02): reentra sobre el motor puro (`avanzar`) hasta agotar sus peticiones
 * `requiere`, resolviéndolas con `AIService`, y al final ejecuta los efectos y persiste el
 * `FlowState`. El efecto `programar_espera` se intercepta aquí (no en `ejecutarEfecto`) porque
 * necesita devolver el token generado para que `persistirFlowState` lo escriba en el mismo `$set`.
 */
async function correrMotor(
  tenantId: string,
  clienteId: string,
  flow: IFlowLean,
  stateDoc: IFlowState | null,
  mensaje: string,
  resueltosIniciales: EntradaMotor['resueltos'],
  metaMessageId?: string,
): Promise<void> {
  let estadoActual = stateDoc;
  let resueltos = resueltosIniciales;
  let salida: SalidaMotor | undefined;

  for (let ronda = 0; ronda < TOPE_RESOLUCIONES; ronda += 1) {
    salida = avanzar({ flow, state: estadoActual, mensaje, resueltos });
    if (!salida.requiere) break;

    resueltos = await resolverRequiere(tenantId, clienteId, salida.requiere, mensaje);
    estadoActual = {
      tenantId: flow.tenantId,
      clienteId: new Types.ObjectId(clienteId),
      flowId: flow._id,
      nodoActualId: salida.nodoSiguiente ?? flow.entrada,
      variables: salida.variables,
      esperandoRespuesta: salida.esperandoRespuesta,
      actualizadoAt: new Date(),
    };
  }

  if (!salida) return;

  let esperaToken: string | undefined;
  for (const efecto of salida.efectos) {
    if (efecto.tipo === 'programar_espera') {
      try {
        const token = randomUUID();
        await flowRuntimeQueue.add(
          FLOW_RESUME_JOB,
          { tipo: 'resume', tenantId, clienteId, token },
          { delay: efecto.minutos * 60_000, ...RESUME_JOB_OPTS },
        );
        esperaToken = token;
      } catch (err) {
        // Igual que el resto de efectos: un fallo aquí no puede tumbar la persistencia del resto
        // de la pasada. Sin token, `persistirFlowState` deja `esperaToken: null` — no hay job
        // encolado, así que no debe quedar un token que nadie va a invalidar.
        logger.error('No se pudo encolar la reanudación del nodo espera (no propaga)', {
          tenantId: tenantId.toString(),
          clienteId,
          error: String(err),
        });
      }
      continue;
    }
    await ejecutarEfecto(tenantId, clienteId, efecto);
  }

  await persistirFlowState(tenantId, clienteId, flow, salida, metaMessageId, esperaToken);
}

/**
 * Punto de entrada del motor de flujos para un mensaje entrante (HU-FLOW-01). Guardas del llamador
 * (`iaHabilitada`, flujo activo) van en el worker, no aquí: esta función asume que ya se decidió
 * que el flujo debe intervenir. `metaMessageId` es la clave de idempotencia: reprocesar el mismo
 * mensaje (reintento del job) no vuelve a avanzar el flujo.
 */
export async function ejecutarFlujo(
  tenantId: string,
  clienteId: string,
  mensaje: string,
  metaMessageId?: string,
): Promise<void> {
  const flow = await getActiveFlow(tenantId);
  if (!flow) return;

  // Defensa propia además de la guarda del worker (`cliente.iaHabilitada` antes de llamar): si
  // algo más alguna vez invoca `ejecutarFlujo` directamente, el motor sigue sin pisar a un asesor
  // humano que ya tomó la conversación.
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente || !cliente.iaHabilitada) return;

  const stateDoc = await findOneScoped(FlowState, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    flowId: flow._id,
  }).lean<IFlowState | null>();

  if (metaMessageId && stateDoc?.ultimoMetaMessageId === metaMessageId) return;

  await correrMotor(tenantId, clienteId, flow, stateDoc, mensaje, undefined, metaMessageId);
}

/**
 * Reanuda un flujo parado en un nodo `espera` (HU-FLOW-02), disparado por el job diferido de
 * `flow-runtime` al vencer el plazo. Reentra al motor en el MISMO nodo `espera` con
 * `resueltos.esperaCumplida`, así que el destino se recalcula con las aristas vigentes en ese
 * momento — nunca uno congelado al programar la espera.
 *
 * Si `token` no coincide con `FlowState.esperaToken`, el cliente respondió mientras tanto (el
 * avance por respuesta ya limpió o regeneró el token) y este job se descarta sin hacer nada: es
 * la resolución de la carrera del criterio 3, comprobada dentro de la ejecución en vez de intentar
 * cancelar el job en BullMQ.
 */
export async function reanudarFlujo(tenantId: string, clienteId: string, token: string): Promise<void> {
  const stateDoc = await findOneScoped(FlowState, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
  }).lean<IFlowState | null>();

  if (!stateDoc || stateDoc.esperaToken !== token) return;

  const flow = await getActiveFlow(tenantId);
  if (!flow) return;

  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente || !cliente.iaHabilitada) return;

  await correrMotor(tenantId, clienteId, flow, stateDoc, '', { esperaCumplida: true });
}

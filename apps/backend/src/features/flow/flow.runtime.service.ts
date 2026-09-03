import { Types } from 'mongoose';
import { z } from 'zod';
import { findByIdScoped, findOneAndUpdateScoped, findOneScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import type { ChatTurn, SlotSpec } from '../../integrations/llm/llm-provider.types.js';
import { Cliente } from '../cliente/cliente.model.js';
import { createLeadFromConversation } from '../lead/lead.service.js';
import { assignConversation, setConversationTags, setIaHabilitada } from '../conversation/conversation.service.js';
import { sendOutbound } from '../message/message.service.js';
import { avanzar } from './flow.engine.js';
import { getActiveFlow } from './flow.service.js';
import { FlowState } from './flow.model.js';
import type { Efecto, EntradaMotor, IFlowLean, IFlowState, RequiereMotor, SalidaMotor } from './flow.types.js';

type TenantId = string | Types.ObjectId;

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

async function persistirFlowState(
  tenantId: TenantId,
  clienteId: string,
  flow: IFlowLean,
  salida: SalidaMotor,
  metaMessageId?: string,
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
        actualizadoAt: new Date(),
        ...(metaMessageId ? { ultimoMetaMessageId: metaMessageId } : {}),
      },
    },
    { upsert: true, new: true },
  );
}

/**
 * Punto de entrada del motor de flujos para un mensaje entrante (HU-FLOW-01). Guardas del llamador
 * (`iaHabilitada`, flujo activo) van en el worker, no aquí: esta función asume que ya se decidió
 * que el flujo debe intervenir.
 *
 * Reentra sobre el motor puro (`avanzar`) hasta agotar sus peticiones `requiere` (intención, KB o
 * una captura ya respondida), resolviéndolas con `AIService`, y al final ejecuta los efectos y
 * persiste el `FlowState`. `metaMessageId` es la clave de idempotencia: reprocesar el mismo mensaje
 * (reintento del job) no vuelve a avanzar el flujo.
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

  let estadoActual = stateDoc;
  let resueltos: EntradaMotor['resueltos'];
  let salida: SalidaMotor | undefined;

  for (let ronda = 0; ronda < TOPE_RESOLUCIONES; ronda += 1) {
    salida = avanzar({ flow, state: estadoActual, mensaje, resueltos });
    if (!salida.requiere) break;

    resueltos = await resolverRequiere(tenantId, salida.requiere, mensaje);
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

  for (const efecto of salida.efectos) {
    await ejecutarEfecto(tenantId, clienteId, efecto);
  }

  await persistirFlowState(tenantId, clienteId, flow, salida, metaMessageId);
}

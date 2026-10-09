import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  countScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
} from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { ITemaIA } from '../cliente/cliente.types.js';
import { Message } from '../message/message.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { listarProductosKb, normalizarClave, type ProductoKb } from '../kb/kb-productos.reader.js';
import { PREFIJO_CLIENTE_DEMO } from '../reports/reports.types.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { construirHistorial } from './ai-shared.js';

/** Qué hizo una pasada del clasificador. El backfill lo cuenta; el worker lo ignora. */
export type ResultadoTema = 'clasificada' | 'saltada' | 'fallida';

/**
 * El freno de coste (HU-REP-03, D4). Pura y sin dependencias a propósito: es la regla que decide
 * cuánto paga el tenant por este reporte, y se testea sola.
 *
 *  - Sin tema previo → clasificar.
 *  - La lista de productos cambió → reclasificar: las opciones que vio el modelo ya no son las mismas.
 *  - Si no, solo tras `TEMA_RECLASIFICAR_CADA` mensajes nuevos del cliente, o
 *    `TEMA_RECLASIFICAR_ESTABLE` cuando el tema ya salió igual dos veces seguidas.
 */
export function debeClasificar(
  tema: ITemaIA | undefined,
  mensajesCliente: number,
  catalogoVersion: string,
): boolean {
  if (!tema) return true;
  if (tema.catalogoVersion !== catalogoVersion) return true;
  const nuevos = mensajesCliente - tema.mensajesCliente;
  const umbral = tema.repeticiones >= 2 ? env.TEMA_RECLASIFICAR_ESTABLE : env.TEMA_RECLASIFICAR_CADA;
  return nuevos >= umbral;
}

/**
 * Traduce la respuesta del modelo a un producto de la lista. Un nombre que no está —el `enum` del
 * proveedor lo impide, pero otro proveedor podría no hacerlo— o una confianza bajo el umbral
 * cuentan como `otros`: un producto adivinado ensucia el ranking más que uno sin clasificar.
 */
function productoElegido(tema: string, confianza: number, productos: ProductoKb[]): ProductoKb | null {
  if (confianza < env.TEMA_MIN_CONFIANZA) return null;
  const clave = normalizarClave(tema);
  return productos.find((p) => p.clave === clave) ?? null;
}

interface Preparacion {
  anterior: ITemaIA | undefined;
  productos: ProductoKb[];
  version: string;
  mensajesCliente: number;
}

/**
 * El guard entero, sin llamar al modelo: `null` si esta conversación no debe clasificarse ahora.
 * Lo comparten el clasificador y el `--dry-run` del backfill, para que el simulacro cuente
 * exactamente lo que la corrida real pagaría.
 */
async function preparar(tenantId: string, clienteId: string): Promise<Preparacion | null> {
  // Antes de cualquier lectura: el interruptor tiene que ahorrar también las consultas.
  if (env.TEMA_AUTO !== 'on') return null;

  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente || PREFIJO_CLIENTE_DEMO.test(cliente.metaUserId)) return null;

  // Sin productos en la KB no hay vocabulario: cualquier respuesta sería `otros`.
  const { productos, version } = await listarProductosKb(tenantId);
  if (productos.length === 0) return null;

  const mensajesCliente = await countScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    sender: 'user',
  });
  // Un "hola" suelto no dice qué producto busca: la llamada se pagaría para obtener `otros`.
  if (mensajesCliente < env.TEMA_MIN_TURNOS_CLIENTE) return null;

  if (!debeClasificar(cliente.temaIA, mensajesCliente, version)) return null;
  return { anterior: cliente.temaIA, productos, version, mensajesCliente };
}

/** `true` si `clasificarTemaSiHaceFalta` llamaría al modelo para esta conversación. */
export async function necesitaClasificarTema(tenantId: string, clienteId: string): Promise<boolean> {
  return (await preparar(tenantId, clienteId)) !== null;
}

/**
 * Clasifica el tema de la conversación —qué producto de la KB consulta el cliente— si hace falta y
 * si sale a cuenta (HU-REP-03).
 *
 * **Nunca lanza.** En línea corre al final del auto-reply, cuando la respuesta ya salió: un fallo
 * aquí cuesta un tema desactualizado, no un job fallido. El backfill lo usa igual y cuenta los
 * `fallida`; una re-ejecución los recoge.
 *
 * El clasificador en línea y el backfill pasan por este mismo guard, así que no duplican: el
 * segundo en llegar ya no supera el freno.
 */
export async function clasificarTemaSiHaceFalta(
  tenantId: string,
  clienteId: string,
  historial?: ChatTurn[],
): Promise<ResultadoTema> {
  try {
    const prep = await preparar(tenantId, clienteId);
    if (!prep) return 'saltada';
    const { anterior, productos, version, mensajesCliente } = prep;

    const turnos = historial ?? (await construirHistorial(tenantId, clienteId));
    const { data } = await getAIService().classifyTopic({
      tenantId: new Types.ObjectId(tenantId),
      historial: turnos,
      opciones: productos.map(({ nombre, descripcion }) => ({ nombre, ...(descripcion ? { descripcion } : {}) })),
      catalogoVersion: version,
    });

    const producto = productoElegido(data.tema, data.confianza, productos);
    const clave = producto?.clave ?? null;
    const temaIA: ITemaIA = {
      clave,
      nombre: producto?.nombre ?? null,
      confianza: data.confianza,
      at: new Date(),
      mensajesCliente,
      repeticiones: anterior && anterior.clave === clave ? anterior.repeticiones + 1 : 1,
      catalogoVersion: version,
      modelo: env.GEMINI_MODEL,
    };

    await findOneAndUpdateScoped(
      Cliente,
      tenantId,
      { _id: new Types.ObjectId(clienteId) },
      { $set: { temaIA } },
    );

    // Solo cuando el tema cambia. Auditar cada reclasificación dejaría eventos idénticos; mismo
    // criterio que `cliente.semaforo`.
    if (!anterior || anterior.clave !== clave) {
      await recordAuditEvent(tenantId, {
        actorId: null, // el sistema
        accion: 'cliente.tema',
        entidad: 'cliente',
        entidadId: clienteId,
        antes: anterior ? { clave: anterior.clave, nombre: anterior.nombre } : {},
        despues: { clave, nombre: temaIA.nombre, confianza: data.confianza },
      });
    }
    return 'clasificada';
  } catch (err: unknown) {
    // Incluye el 429 de Gemini tras sus reintentos. No se propaga: ver el comentario de la función.
    logger.warn('Tema: falló la clasificación de la conversación', {
      tenantId,
      clienteId,
      error: String(err),
    });
    return 'fallida';
  }
}

import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { ejecutarExtraccion } from '../cliente/cliente.service.js';
import type { CampoExtraido } from '../cliente/cliente.types.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { publishConversationUpdated } from '../conversation/conversation.service.js';
import { turnosDelCliente } from './ai-shared.js';

/**
 * Campos cuya ausencia justifica pagar otra extracción.
 *
 * **`telefono` queda fuera a propósito**: nunca es `null` —si el cliente no dicta ninguno, cae al
 * número de WhatsApp desde el que escribe—, así que incluirlo haría que `faltaAlgo` fuese siempre
 * `false` y la extracción automática no correría jamás. Es el fallo silencioso más fácil de
 * introducir aquí, y por eso tiene su propio test.
 */
const CAMPOS_AUTO = ['nombreCompleto', 'correo', 'interes'] as const satisfies readonly CampoExtraido[];

/**
 * Extrae los datos de contacto al final del ciclo de auto-reply, si hace falta y si sale a cuenta
 * (HU-IA-06).
 *
 * **No lanza nunca.** Un fallo aquí —timeout del proveedor, plantilla ausente, 500 de Gemini— no
 * puede tumbar la respuesta al cliente, que ya se envió. Se registra como `warn` y se sigue.
 *
 * Corre una vez por ráfaga agrupada (`AI_REPLY_WINDOW_MS`), no una por mensaje, porque el worker
 * agrupa las ráfagas desde HU-IA-02.
 */
export async function extraerDatosSiHaceFalta(
  tenantId: string,
  clienteId: string,
  historial: ChatTurn[],
): Promise<void> {
  // Antes de cualquier lectura: el interruptor tiene que ahorrar también el coste del modelo.
  if (env.EXTRACT_AUTO !== 'on') return;
  // Un "hola" suelto no contiene datos de contacto: la llamada se pagaría para no encontrar nada.
  if (turnosDelCliente(historial) < env.EXTRACT_MIN_TURNOS_CLIENTE) return;

  try {
    const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
    if (!cliente) return;

    const datos = cliente.datosExtraidos;
    // Techo de coste: cuando los tres campos buscables están encontrados, esta conversación deja
    // de pagar extracciones para siempre. El asesor conserva el botón para re-extraer a mano.
    const faltaAlgo = !datos || CAMPOS_AUTO.some((campo) => (datos[campo] ?? null) === null);
    // Y no se re-extrae sobre el mismo transcript: sin mensajes nuevos, el resultado sería idéntico.
    const hayNovedad =
      !datos || (cliente.ultimoMensajeAt ?? new Date(0)).getTime() > datos.extraidoAt.getTime();
    if (!faltaAlgo || !hayNovedad) return;

    // `actorId: null` = el sistema, el mismo convenio de la semaforización y el handoff automático.
    await ejecutarExtraccion(tenantId, clienteId, null);
    // La ficha abierta se refresca sola: `conversation:updated` ya invalida `['contact-history']`
    // en `useInboxRealtime`, así que no hace falta un evento nuevo.
    await publishConversationUpdated(tenantId, clienteId);
  } catch (err) {
    logger.warn('Extracción: falló la lectura de datos de contacto', {
      tenantId,
      clienteId,
      error: String(err),
    });
  }
}

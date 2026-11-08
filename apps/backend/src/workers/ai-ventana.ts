import { marcarParaAsesor } from '../features/conversation/conversation.service.js';
import { registrarRetencion } from '../features/send-window/send-window.service.js';

/**
 * Comportamiento de la categoría `ia` fuera de la ventana horaria de envío (HU-CONF-01): el
 * mensaje de Sofi NO sale, queda rastro (log + auditoría `mensaje.retenido-horario`) y la
 * conversación sube a la bandeja para que la recoja una persona cuando abra la franja. No lanza
 * nada propio: el job que lo invoca termina bien y BullMQ no reintenta.
 */
export async function descartarIaPorVentana(
  tenantId: string,
  clienteId: string,
  siguienteApertura: Date | null,
): Promise<void> {
  await registrarRetencion(tenantId, { categoria: 'ia', accion: 'descartado', siguienteApertura, clienteId });
  await marcarParaAsesor(tenantId, clienteId);
}

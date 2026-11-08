import { randomUUID } from 'node:crypto';
import type { IMessagingProvider } from '../meta/messaging-provider.interface.js';
import { PREFIJO_MENSAJE_PRUEBA } from '../../features/sandbox/sandbox.types.js';

function nuevoMessageId(): { messageId: string } {
  return { messageId: `${PREFIJO_MENSAJE_PRUEBA}${randomUUID()}` };
}

/**
 * Proveedor de la conversación de prueba (HU-IA-08): cumple el mismo contrato que Meta, pero no sale
 * a ninguna red. Solo fabrica el id que Meta habría devuelto, para que el mensaje se persista igual
 * que uno real. No necesita `phoneNumberId` ni token: el tenant puede probar sin tener WhatsApp
 * conectado.
 */
export const sandboxMessagingProvider: IMessagingProvider = {
  sendText: async () => nuevoMessageId(),
  sendTemplate: async () => nuevoMessageId(),
  sendMedia: async () => nuevoMessageId(),
};

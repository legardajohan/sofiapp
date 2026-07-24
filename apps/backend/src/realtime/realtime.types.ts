import type { IConversationResponse, IMessageResponse } from '../features/conversation/conversation.types.js';

/** Canal Redis pub/sub que puentea el proceso worker con el gateway del proceso web. */
export const REALTIME_CHANNEL = 'realtime';

/**
 * Eventos de tiempo real. Siempre llevan `tenantId` para que el gateway los emita
 * únicamente al room `tenant:<tenantId>` — nunca en broadcast global.
 */
export type RealtimeEvent =
  | {
      type: 'message:new';
      tenantId: string;
      conversationId: string;
      message: IMessageResponse;
      conversation: IConversationResponse;
    }
  | {
      type: 'conversation:updated';
      tenantId: string;
      conversationId: string;
      conversation: IConversationResponse;
    }
  | {
      type: 'conversation:assigned';
      tenantId: string;
      conversationId: string;
      conversation: IConversationResponse;
      /** `null` cuando el cambio fue una desasignación (no hay a quién notificar). */
      targetUserId: string | null;
      actor: { id: string; nombre: string | null };
    };

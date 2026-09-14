import type { IConversationResponse, IMessageResponse } from '../features/conversation/conversation.types.js';
import type { ILeadResponse } from '../features/lead/lead.types.js';

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
      /**
       * Quién reasignó. `id: null` es **Sofi**: el handoff automático de HU-IA-03 no lo dispara
       * ninguna persona, y no hay un `User` que ponerle.
       */
      actor: { id: string | null; nombre: string | null };
    }
  | {
      /**
       * Un lead cambió de etapa (HU-PIPE-01). Va al room del tenant entero, no al del asesor: el
       * embudo es una vista compartida y cualquier administrador con el tablero abierto tiene que
       * ver moverse la tarjeta.
       *
       * Solo se emite en un cambio **efectivo**: soltar una tarjeta en la columna de la que salió
       * no mueve nada y no debe hacer parpadear el tablero de los demás.
       */
      type: 'lead:stage-changed';
      tenantId: string;
      leadId: string;
      /** `key` de la etapa de origen y de destino: la UI sabe qué dos columnas refrescar. */
      de: string;
      a: string;
      lead: ILeadResponse;
    };

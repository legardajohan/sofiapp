import type { IConversationResponse, IMessageResponse } from '../features/conversation/conversation.types.js';
import type { ILeadResponse } from '../features/lead/lead.types.js';
import type { EstadoCampana, ITotalesCampana } from '../features/campaign/campaign.types.js';

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
      /**
       * Un mensaje que YA existe cambió (HU-OMNI-06): su media terminó de descargarse, o falló.
       *
       * No se reutiliza `message:new` porque el hilo lo trata como alta y duplicaría la burbuja.
       * El cliente resuelve este evento reemplazando por `id` dentro de la caché del hilo.
       */
      type: 'message:updated';
      tenantId: string;
      conversationId: string;
      message: IMessageResponse;
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
    }
  | {
      /**
       * Avance de una campaña (HU-MARK-01). Nace en el worker, que es donde se envía, y se emite
       * al room del tenant: la pantalla de campañas es una vista compartida entre administradores.
       *
       * Se manda una vez por lote, no por destinatario: un envío de 10 000 produciría 10 000
       * eventos y lo único que la UI necesita es la barra de progreso moviéndose.
       */
      type: 'campaign:progress';
      tenantId: string;
      campaignId: string;
      estado: EstadoCampana;
      totales: ITotalesCampana;
    };

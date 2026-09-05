import type { AdminSubrol } from '../users/user.types.js';
import type { Direccion, MessageStatus, Sender, TipoMensaje } from '../message/message.types.js';
import type { ITagResponse } from '../tag/tag.types.js';
import type { HandoffMotivo, IHandoffCondicionAplicada } from '../ai/ai-handoff.types.js';
import type { ISemaforoIAResponse } from '../ai/ai-semaforo.types.js';
// El resumen ya tenía su DTO en la ficha del contacto (HU-OMNI-03): se importa en vez de declarar
// un gemelo que se separaría del original a la primera edición.
import type { IResumenResponse } from '../cliente/cliente.types.js';

/** Segmentos de la bandeja (submenú del sidebar). */
export type FiltroBandeja = 'todos' | 'mios' | 'sin_asignar' | 'sofi';

export type EstadoComercial = 'nuevo' | 'en_gestion' | 'pago_pendiente' | 'pagado' | 'perdido';

/** Una conversación es un `Cliente` proyectado para la bandeja (no hay colección propia). */
export interface IConversationResponse {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  ultimoMensajeAt: string | null;
  preview: string | null;
  noLeidos: number;
  /** Campo persistido (`Cliente.asesorId`, HU-OMNI-01). Se conserva por compatibilidad. */
  asesorId: string | null;
  /** Alias público del contrato HTTP (HU-OMNI-02): mismo valor que `asesorId`. */
  asignadoA: string | null;
  asignadoANombre: string | null;
  asignadoASubrol: AdminSubrol | null;
  iaHabilitada: boolean;
  ventana24hAbierta: boolean;
  estadoComercial: string;
  /** Etiquetas ya hidratadas (HU-OMNI-04): la bandeja pinta los chips sin una segunda llamada. */
  tags: ITagResponse[];
  /**
   * Lead al que ya se convirtió esta conversación, o `null` (HU-CRM-01). Viaja resuelto para que la
   * cabecera muestre el estado en vez de ofrecer una conversión que fallaría con 409.
   */
  leadId: string | null;
  /**
   * Marca de que Sofi transfirió esta conversación a una persona (HU-IA-03). `null` mientras no
   * haya pasado, y vuelve a `null` cuando un asesor reactiva a Sofi en el hilo. Viaja resuelto para
   * que la bandeja lo pinte sin consultar `audit_events` fila a fila.
   */
  handoff: {
    at: string;
    motivo: HandoffMotivo;
    /** La condición propia que lo disparó (HU-IA-07); `null` para las cuatro de fábrica. */
    condicion: IHandoffCondicionAplicada | null;
  } | null;
}

/**
 * Qué puede hacer el usuario que pregunta, resuelto en el servidor (HU-IA-04).
 *
 * Viaja en la respuesta para que la UI **oculte** sin adivinar: el gemelo de `lib/roles.ts` sirve
 * para no ofrecer acciones que devolverían 403, pero la fuente de verdad es esta. Son tres campos
 * aunque hoy los tres valgan lo mismo — el día que se separen, el frontend no cambia.
 */
export interface IPermisosConversacion {
  /** Leer el resumen por IA. Desde HU-IA-04 es un dato sensible (ADR-0006, enmienda). */
  verResumen: boolean;
  /** Generarlo o regenerarlo. Quien no puede leerlo tampoco paga la llamada al modelo. */
  generarResumen: boolean;
  /** Correo, documento y atributos marcados como sensibles del contacto. */
  verSensibles: boolean;
}

/**
 * Todo lo que la vista de una conversación necesita **menos el hilo** (HU-IA-04).
 *
 * El hilo se queda fuera a propósito: pagina (`GET /:id/messages`) y se refresca solo con
 * `message:new`. Incluirlo aquí obligaría a reconciliar dos copias de los mismos mensajes en cada
 * entrante, y a paginar dos veces la misma colección.
 */
export interface IConversationOverviewResponse {
  /** Ya trae `tags` hidratadas: `toConversationResponse` las resuelve desde HU-OMNI-04. */
  conversation: IConversationResponse;
  /** `null` si no se ha generado nunca **o** si el usuario no puede verlo (ver `permisos`). */
  resumen: IResumenResponse | null;
  /**
   * Última clasificación de intención de compra (HU-IA-05). `null` si la IA nunca clasificó esta
   * conversación. Va aquí y no en un endpoint propio porque la tira que lo muestra ya consume esta
   * lectura.
   */
  semaforoIA: ISemaforoIAResponse | null;
  permisos: IPermisosConversacion;
}

/** Un evento del historial de reasignaciones de una conversación (`audit_events`). */
export interface IAssignmentResponse {
  id: string;
  /** `null` cuando la reasignación la hizo el sistema (handoff automático, HU-IA-03). */
  actorId: string | null;
  actorNombre: string | null;
  de: { id: string; nombre: string | null } | null;
  a: { id: string; nombre: string | null } | null;
  createdAt: string;
}

export interface IMessageResponse {
  id: string;
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  texto: string | null;
  attachmentUrl: string | null;
  status: MessageStatus;
  createdAt: string;
}

export interface IPaginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

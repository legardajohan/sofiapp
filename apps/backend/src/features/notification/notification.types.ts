import type { Document, Types } from 'mongoose';

/**
 * Los dos disparadores que ya existen y ya notifican en vivo (HU-IA-03, HU-OMNI-02). El tipo queda
 * abierto a futuro, pero esta historia solo escribe estos dos.
 */
export type NotificationTipo = 'handoff' | 'assignment';

// Colección tenant-scoped. Se accede SIEMPRE vía *Scoped.
export interface INotification {
  tenantId: Types.ObjectId;
  /** Destinatario. Filtrar por este campo —no solo por tenant— es lo que impide que un admin lea
   *  o marque como leída la notificación de OTRO admin del mismo tenant. */
  userId: Types.ObjectId;
  tipo: NotificationTipo;
  conversacionId: Types.ObjectId;
  /** Snapshot (`nombre ?? telefono`) tomado al crear la notificación — mismo criterio que
   *  `audit_events.antes/despues`: evita depender de un `populate` que saltaría el repositorio
   *  scoped o de que la conversación siga existiendo igual después. */
  clienteResumen: string;
  /** `null` = Sofi (handoff automático, HU-IA-03). */
  actorId: Types.ObjectId | null;
  actorNombre: string;
  mensaje: string;
  leidaAt: Date | null;
}

export interface INotificationDocument extends INotification, Document {}

export interface INotificationResponse {
  id: string;
  tipo: NotificationTipo;
  conversacionId: string;
  clienteResumen: string;
  actorId: string | null;
  actorNombre: string;
  mensaje: string;
  leidaAt: string | null;
  createdAt: string;
}

export interface CreateNotificationInput {
  userId: string;
  tipo: NotificationTipo;
  conversacionId: string;
  clienteResumen: string;
  actorId: string | null;
  actorNombre: string;
  mensaje: string;
}

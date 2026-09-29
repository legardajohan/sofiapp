export type NotificationTipo = 'handoff' | 'assignment';

export interface NotificationDTO {
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

/** Identificador estable de las etiquetas de semaforización; no cambia aunque se renombren. */
export type SemaforoSlug = 'azul' | 'rojo' | 'naranja' | 'verde';

export interface TagDTO {
  id: string;
  nombre: string;
  /** Hex `#RRGGBB` elegido por el administrador. Es dato, no un token de diseño. */
  color: string;
  semaforo: SemaforoSlug | null;
  /** HU-MARK-07. `campana` = la generó el envío de una campaña. Opcional: backend anterior. */
  origen?: 'manual' | 'campana';
  campaignId?: string | null;
}

/** Tope del nombre de una etiqueta (HU-MARK-07: antes 30, no cabía «Campaña {nombre} - {fecha}»). */
export const TAG_NOMBRE_MAX = 60;

export interface CreateTagPayload {
  nombre: string;
  color: string;
}

export interface UpdateTagPayload {
  nombre?: string;
  color?: string;
}

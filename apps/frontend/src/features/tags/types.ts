/** Identificador estable de las etiquetas de semaforización; no cambia aunque se renombren. */
export type SemaforoSlug = 'azul' | 'rojo' | 'naranja' | 'verde';

export interface TagDTO {
  id: string;
  nombre: string;
  /** Hex `#RRGGBB` elegido por el administrador. Es dato, no un token de diseño. */
  color: string;
  semaforo: SemaforoSlug | null;
}

export interface CreateTagPayload {
  nombre: string;
  color: string;
}

export interface UpdateTagPayload {
  nombre?: string;
  color?: string;
}

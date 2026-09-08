/** Una etapa del pipeline de leads. Es dato del tenant, no un enum del código (HU-CRM-03). */
export interface EstadoDTO {
  id: string;
  /** Clave estable: es lo que queda grabado en `Lead.estado`. No cambia al renombrar. */
  key: string;
  label: string;
  /** `#RRGGBB` elegido por la empresa. Nunca un token de diseño. */
  color: string;
  orden: number;
  activo: boolean;
  esDefecto: boolean;
  /**
   * Etapa terminal del embudo (HU-PIPE-01): de fábrica, «Perdido» y «Declinado».
   *
   * Es descriptivo, no restrictivo: no impide mover un lead fuera de ella. Solo sirve para que el
   * tablero señale qué columnas cierran el recorrido.
   */
  esSalida: boolean;
}

export interface CreateEstadoPayload {
  label: string;
  color?: string;
}

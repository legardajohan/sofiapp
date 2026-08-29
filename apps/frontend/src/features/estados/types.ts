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
}

export interface CreateEstadoPayload {
  label: string;
  color?: string;
}

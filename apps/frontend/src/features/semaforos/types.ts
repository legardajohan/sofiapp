/**
 * Un semáforo de la clasificación comercial de leads. Es dato del tenant, no un enum del código
 * (HU-CRM-04): cada empresa renombra los cuatro de fábrica y añade los suyos.
 */
export interface SemaforoDTO {
  id: string;
  /** Clave estable: es lo que queda grabado en `Lead.semaforo`. No cambia al renombrar. */
  key: string;
  label: string;
  /** `#RRGGBB` elegido por la empresa. Nunca un token de diseño. */
  color: string;
  orden: number;
  activo: boolean;
  /** Uno de los cuatro sembrados. Se renombra y recolorea, pero no se archiva. */
  esDefecto: boolean;
}

export interface CreateSemaforoPayload {
  label: string;
  color?: string;
}

export interface UpdateSemaforoPayload {
  label?: string;
  color?: string;
  activo?: boolean;
}

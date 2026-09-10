import type { Document, Types } from 'mongoose';

/**
 * Etapas del pipeline de un lead, **configurables por tenant** (HU-CRM-03).
 *
 * Hasta ahora eran el enum fijo `ESTADOS_COMERCIALES`, igual para todas las empresas. Es el mismo
 * supuesto de vertical que ya se sacó del modelo en los catálogos de la ficha del contacto
 * (`contact-option`): un gimnasio no tiene "pago pendiente" y una inmobiliaria quiere "visita
 * agendada". Las etapas pasan a ser **datos del tenant**, no estructura.
 */

/** Color de un estado creado sin elegir uno. Gris neutro: no hereda significado hasta que se lo den. */
export const COLOR_ESTADO_DEFECTO = '#475569';

export interface IEstado {
  tenantId: Types.ObjectId;
  /**
   * Slug estable derivado del `label` al crearlo. **No cambia al renombrar**: es el valor que queda
   * grabado en `Lead.estado`, así que mutarlo desharía el vínculo con todos los leads que ya lo
   * tienen. Mismo criterio que `IContactOption.key` y `Tag.semaforo`.
   */
  key: string;
  label: string;
  /** Color en `#RRGGBB`. Dato del tenant, no un token de diseño: cada empresa colorea su pipeline. */
  color: string;
  /** Posición en el pipeline. El orden cuenta una historia (nuevo → … → pagado); alfabético la rompe. */
  orden: number;
  /**
   * `false` = archivado: no se ofrece para elegir, pero sigue resolviendo su `label` en los leads
   * que ya lo tienen. Un estado en uso no puede desaparecer sin dejar filas con una clave cruda.
   */
  activo: boolean;
  /** Sembrado al crear el tenant. Informativo: se renombra y se archiva como cualquier otro. */
  esDefecto: boolean;
}

export interface IEstadoDocument extends IEstado, Document {}

export interface CreateEstadoDTO {
  label: string;
  /** Ausente = `COLOR_ESTADO_DEFECTO`: elegir color no puede ser obligatorio para dar de alta. */
  color?: string;
}

export interface IEstadoResponse {
  id: string;
  key: string;
  label: string;
  color: string;
  orden: number;
  activo: boolean;
  esDefecto: boolean;
}

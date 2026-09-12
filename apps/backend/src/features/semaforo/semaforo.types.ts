import type { Document, Types } from 'mongoose';

/**
 * Catálogo de semaforización comercial del lead, **configurable por tenant** (HU-CRM-04).
 *
 * Nace como los cuatro colores de `docs/domain.md` §5 —azul (frío), naranja (potencial), verde
 * (venta concretada), rojo (descartado)— pero es un catálogo, no un enum: es el mismo camino que ya
 * recorrieron las etapas del pipeline (`estado`, HU-CRM-03) y los catálogos de la ficha del contacto
 * (`contact-option`). Una empresa que trabaja con cinco temperaturas no debería tener que elegir
 * cuatro.
 *
 * La diferencia con `estado`: los cuatro sembrados están **protegidos**. Se renombran y recolorean,
 * pero no se archivan ni se borran, porque su `key` es el contrato estable con el que IA-05 y
 * MARK-01 los resolverán y con el que se sincroniza la etiqueta de la conversación (HU-OMNI-04).
 */

/** Color de un semáforo creado sin elegir uno. Gris neutro: no hereda significado hasta que se lo den. */
export const COLOR_SEMAFORO_DEFECTO = '#475569';

export interface ISemaforo {
  tenantId: Types.ObjectId;
  /**
   * Slug estable derivado del `label` al crearlo. **No cambia al renombrar**: es el valor que queda
   * grabado en `Lead.semaforo`, así que mutarlo desharía el vínculo con todos los leads que ya lo
   * tienen. Mismo criterio que `IEstado.key`, `IContactOption.key` y `Tag.semaforo`.
   */
  key: string;
  label: string;
  /** Color en `#RRGGBB`. Dato del tenant, no un token de diseño. */
  color: string;
  /** Posición en el listado. Los cuatro de fábrica cuentan un recorrido: frío → potencial → cerrado. */
  orden: number;
  /**
   * `false` = archivado: no se ofrece para clasificar, pero sigue resolviendo su `label` en los
   * leads que ya lo tienen. Los de fábrica no se pueden archivar.
   */
  activo: boolean;
  /**
   * Uno de los cuatro sembrados. **No es informativo como en `estado`**: aquí protege del archivado
   * y es la marca de que su `key` es uno de los slugs del contrato de `docs/domain.md` §5.
   */
  esDefecto: boolean;
}

export interface ISemaforoDocument extends ISemaforo, Document {}

export interface CreateSemaforoDTO {
  label: string;
  /** Ausente = `COLOR_SEMAFORO_DEFECTO`: elegir color no puede ser obligatorio para dar de alta. */
  color?: string;
}

/**
 * Todos opcionales, pero al menos uno presente (lo exige el schema Zod). `key` no está: es
 * inmutable por diseño.
 */
export interface UpdateSemaforoDTO {
  label?: string;
  color?: string;
  activo?: boolean;
}

export interface ISemaforoResponse {
  id: string;
  key: string;
  label: string;
  color: string;
  orden: number;
  activo: boolean;
  esDefecto: boolean;
}

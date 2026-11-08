import type { Document, Types } from 'mongoose';

/**
 * Catálogo por empresa de los **campos personalizados** del contacto (HU-FLOW-05).
 *
 * Antes cada atributo de la ficha (`Cliente.atributos`) tenía una `key` que era un slug del texto que
 * tecleaba cada asesor en cada contacto: «Colegio» en uno e «Institución» en otro eran dos atributos
 * distintos, y ni la segmentación de campañas ni un flujo podían juntarlos. Ahora el campo se define
 * UNA vez por empresa (clave, etiqueta, tipo, sensible) y lo comparten la ficha y el nodo `captura`.
 */
export const TIPOS_DATO_CAMPO = ['texto', 'numero', 'fecha', 'booleano'] as const;
export type TipoDatoCampo = (typeof TIPOS_DATO_CAMPO)[number];

/** Campos fijos del contacto a los que un nodo `captura` puede apuntar. */
export const CAMPOS_FIJOS_CONTACTO = ['nombre', 'correo', 'documento', 'rolContacto'] as const;
export type CampoFijoContacto = (typeof CAMPOS_FIJOS_CONTACTO)[number];

/**
 * Claves que un campo personalizado NO puede usar: ya tienen dueño en la ficha (columnas fijas) o
 * serían sinónimos obvios de ellas. Están **normalizadas** (minúsculas, sin tildes, sin separadores):
 * `Teléfono`, `telefono` y `TELÉFONO` son la misma.
 */
export const CLAVES_RESERVADAS: ReadonlySet<string> = new Set([
  'nombre',
  'name',
  'correo',
  'email',
  'documento',
  'telefono',
  'celular',
  'rol',
  'rolcontacto',
  'nivelinteres',
  'objecionprincipal',
]);

/** Mismo tope que `atributosSchema` en `cliente.validation`: la lista es corta por diseño. */
export const MAX_CAMPOS_POR_CONTACTO = 30;

export interface IContactField {
  tenantId: Types.ObjectId;
  /** Slug del `label` al crear. **Inmutable**: es lo que queda grabado en `Cliente.atributos[].key`. */
  key: string;
  label: string;
  /** `label` sin mayúsculas, tildes ni espacios repetidos: es lo que hace única la etiqueta. */
  labelNormalizado: string;
  tipoDato: TipoDatoCampo;
  sensible: boolean;
  orden: number;
  /** `false` = archivado: no se ofrece para elegir, pero los contactos que lo tienen lo conservan. */
  activo: boolean;
}

export interface IContactFieldDocument extends IContactField, Document {}

export interface CreateContactFieldDTO {
  label: string;
  tipoDato: TipoDatoCampo;
  sensible?: boolean;
}

export interface UpdateContactFieldDTO {
  label?: string;
  tipoDato?: TipoDatoCampo;
  sensible?: boolean;
  orden?: number;
}

export interface IContactFieldResponse {
  id: string;
  key: string;
  label: string;
  tipoDato: TipoDatoCampo;
  sensible: boolean;
  orden: number;
  activo: boolean;
}

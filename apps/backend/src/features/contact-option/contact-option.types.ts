import type { Document, Types } from 'mongoose';

/**
 * Los tres catálogos configurables de la ficha del contacto (HU-CRM-02).
 *
 * Hasta ahora `nivelInteres`, `objecionPrincipal` y `rolContacto` eran enums fijos en el schema de
 * `Cliente`, iguales para todas las empresas. Eran un supuesto del vertical Pre-ICFES metido en el
 * modelo: una inmobiliaria no objeta por "tiempo" y un gimnasio no habla de "decisor". SofiApp es
 * multi-tenant desde el día 1, así que estas listas pasan a ser **datos del tenant**, no estructura.
 */
export const TIPOS_OPCION_CONTACTO = ['interes', 'objecion', 'rol'] as const;

export type TipoOpcionContacto = (typeof TIPOS_OPCION_CONTACTO)[number];

/**
 * Campo de `Cliente` que consume cada catálogo. Es la única traducción entre el tipo de opción y el
 * documento: tenerla en un solo sitio evita que el service, el validador y el borrado inventen cada
 * uno la suya.
 */
export const CAMPO_CLIENTE_POR_TIPO: Record<TipoOpcionContacto, 'nivelInteres' | 'objecionPrincipal' | 'rolContacto'> = {
  interes: 'nivelInteres',
  objecion: 'objecionPrincipal',
  rol: 'rolContacto',
};

/**
 * Color de una opción que se crea sin elegir uno. Gris neutro a propósito: una opción nueva no
 * hereda el significado de ningún color del semáforo hasta que alguien se lo dé.
 */
export const COLOR_OPCION_DEFECTO = '#475569';

/** Etiqueta legible de cada catálogo, para los mensajes de error del validador. */
export const NOMBRE_TIPO: Record<TipoOpcionContacto, string> = {
  interes: 'interés',
  objecion: 'objeción',
  rol: 'rol de contacto',
};

export interface IContactOption {
  tenantId: Types.ObjectId;
  tipo: TipoOpcionContacto;
  /**
   * Slug estable derivado del `label` al crearla. **No cambia al renombrar**: es el valor que queda
   * grabado en `Cliente.nivelInteres` y compañía, así que mutarlo desharía el vínculo con todos los
   * contactos que ya lo tienen. Mismo criterio que `Tag.semaforo` y que `IAtributoPersonalizado.key`.
   */
  key: string;
  label: string;
  /**
   * Color de la opción en `#RRGGBB`. Es **dato del tenant**, no un token de diseño: cada empresa
   * decide que su "Caliente" es rojo. La UI nunca lo pinta crudo — lo pasa por el mismo helper de
   * contraste que los chips de etiqueta, así que un hex desafortunado no produce texto ilegible.
   */
  color: string;
  /** Posición en el desplegable. El asesor lee la lista en el orden que le dio sentido, no alfabético. */
  orden: number;
  /**
   * `false` = archivada: no se ofrece para elegir, pero sigue resolviendo su `label` en los contactos
   * que ya la tienen registrada. Ver `deleteContactOption`.
   */
  activo: boolean;
  /** Sembrada por el sistema al crear el tenant. Es informativo: se renombra y se borra como cualquier otra. */
  esDefecto: boolean;
}

export interface IContactOptionDocument extends IContactOption, Document {}

export interface CreateContactOptionDTO {
  tipo: TipoOpcionContacto;
  label: string;
  /** Ausente = se usa `COLOR_OPCION_DEFECTO`: elegir color no puede ser obligatorio para dar de alta. */
  color?: string;
}

export interface UpdateContactOptionDTO {
  label?: string;
  color?: string;
  activo?: boolean;
  orden?: number;
}

export interface IContactOptionResponse {
  id: string;
  tipo: TipoOpcionContacto;
  key: string;
  label: string;
  color: string;
  orden: number;
  activo: boolean;
  esDefecto: boolean;
}

/**
 * Los tres catálogos en una sola respuesta. El diálogo de edición necesita los tres a la vez, y
 * tres peticiones para pintar tres desplegables sería una cascada gratuita.
 */
export type IContactOptionsResponse = Record<TipoOpcionContacto, IContactOptionResponse[]>;

/**
 * Resultado del borrado. Se distingue lo eliminado de lo archivado porque el asesor tiene que
 * saberlo: una opción que todavía llevan puesta 12 contactos no puede desaparecer sin más, o esas
 * fichas quedarían mostrando una clave cruda.
 */
export interface IDeleteContactOptionResult {
  /** `true` = borrada de verdad; `false` = archivada por estar en uso. */
  eliminada: boolean;
  /** Cuántos contactos del tenant la tenían registrada. */
  enUso: number;
  /** La opción archivada, o `null` si se eliminó. */
  opcion: IContactOptionResponse | null;
}

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

/**
 * Etapa donde aterrizan los leads recién convertidos: es el `estado` con el que nacen
 * (`lead.model` como `default` y `createLead` al escribirlo).
 *
 * Se nombra aquí porque el catálogo ya se puede **editar y borrar**: el guard que impide eliminar o
 * archivar esta etapa necesita exactamente la misma clave que usa el alta de leads. Mientras eran
 * dos literales `'nuevo'` sueltos en `lead.model` y `lead.service` nadie tenía que mantenerlos
 * sincronizados; con un DELETE en la mesa, que se separen es cómo se rompe el embudo.
 */
export const KEY_ESTADO_ENTRADA = 'nuevo';

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
  /**
   * Etapa terminal del embudo: el recorrido acaba aquí (HU-PIPE-01). De fábrica lo son `perdido`
   * —la oportunidad se enfrió— y `declinado` —dijo que no—.
   *
   * Es **descriptivo, no restrictivo**: no bloquea ninguna transición. Las etapas activas siguen
   * siendo libremente alcanzables entre sí; esto solo le dice a la UI qué columnas cierran el
   * embudo para que pueda señalarlas. Convertirlo en una regla de permisos reintroduciría por la
   * puerta de atrás la máquina de transiciones que la historia descarta a propósito.
   */
  esSalida: boolean;
}

export interface IEstadoDocument extends IEstado, Document {}

export interface CreateEstadoDTO {
  label: string;
  /** Ausente = `COLOR_ESTADO_DEFECTO`: elegir color no puede ser obligatorio para dar de alta. */
  color?: string;
}

/**
 * Lo que se puede cambiar de una etapa ya creada.
 *
 * **`key` no está, y no es un olvido:** es el valor grabado en `Lead.estado`. Renombrar «Pagado» a
 * «Ganado» cambia el `label` y deja la clave quieta, igual que al renombrar una opción de contacto
 * o una etiqueta de semáforo; tocarla desharía el vínculo con todos los leads que ya la llevan.
 */
export interface UpdateEstadoDTO {
  label?: string;
  color?: string;
  orden?: number;
  /** `false` archiva la etapa (sale del tablero y del selector); `true` la recupera. */
  activo?: boolean;
  esSalida?: boolean;
}

export interface IEstadoResponse {
  id: string;
  key: string;
  label: string;
  color: string;
  orden: number;
  activo: boolean;
  esDefecto: boolean;
  esSalida: boolean;
  /**
   * Cuántos leads del tenant llevan grabada esta etapa. **Solo con `?uso=true`**, que es lo que
   * pide la pantalla de gestión: es una cuenta por etapa y el tablero, la tabla y los selectores no
   * la necesitan para pintar. Ausente = no se preguntó, que no es lo mismo que cero.
   */
  leads?: number;
}

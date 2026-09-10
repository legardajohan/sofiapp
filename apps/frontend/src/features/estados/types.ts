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
  /**
   * Cuántos leads la tienen grabada. Solo llega con `fetchEstados({ uso: true })`, que es lo que
   * pide la pantalla de gestión: es la cifra que explica por qué una etapa no se puede eliminar.
   * `undefined` = no se preguntó, que no es lo mismo que cero.
   */
  leads?: number;
}

export interface CreateEstadoPayload {
  label: string;
  color?: string;
}

/**
 * Cambios admitidos sobre una etapa ya creada. **`key` no está**: es el vínculo con los leads que ya
 * la tienen grabada, así que renombrar cambia el `label` y deja la clave quieta.
 */
export interface UpdateEstadoPayload {
  label?: string;
  color?: string;
  orden?: number;
  /** `false` archiva la etapa (sale del tablero y de los selectores); `true` la recupera. */
  activo?: boolean;
  esSalida?: boolean;
}

/**
 * Por qué el backend rechazó un borrado, tal como viaja en `AppError.details`.
 *
 * - `en_uso`: hay leads en la etapa; se ofrece archivar en su lugar.
 * - `entrada`: es la etapa donde nacen los leads convertidos; no se puede ni borrar ni archivar.
 */
export type MotivoBloqueo = 'en_uso' | 'entrada';

export interface BloqueoBorrado {
  motivo: MotivoBloqueo;
  /** Solo con `motivo: 'en_uso'`. Cuántos leads están en la etapa según el servidor. */
  enUso: number;
}

/**
 * Clave de la etapa donde nacen los leads convertidos.
 *
 * Espejo de `KEY_ESTADO_ENTRADA` en `apps/backend/src/features/estado/estado.types.ts`, igual que
 * `EstadoDTO` es espejo de `IEstadoResponse`: el repositorio no comparte tipos entre apps todavía.
 * El backend es quien manda —rechaza borrarla y archivarla—; esto solo sirve para no ofrecer aquí
 * un botón que allí siempre va a fallar.
 */
export const KEY_ETAPA_ENTRADA = 'nuevo';

/**
 * Color de una etapa creada sin elegir uno. Gris neutro: no hereda significado hasta que se lo den.
 * Espejo de `COLOR_ESTADO_DEFECTO` del backend, que es quien lo aplica si el alta no manda color.
 */
export const COLOR_ETAPA_DEFECTO = '#475569';

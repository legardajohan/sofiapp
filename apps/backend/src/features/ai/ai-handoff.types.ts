import type { Document, Types } from 'mongoose';

/**
 * Los disparadores de handoff, **en orden de evaluación**.
 *
 * El orden no es decorativo: es la prioridad. Si en un mismo turno se cumplen varias condiciones se
 * ejecuta un solo handoff, el del primero de esta lista. Por eso no hay campo `orden` configurable:
 * la prioridad la fija el producto, no cada empresa, y así dos tenants con la misma configuración
 * se comportan igual.
 *
 * Los dos primeros se deciden mirando lo que escribió el cliente, sin llamar al modelo; los dos
 * últimos necesitan la respuesta ya generada. De ahí que la evaluación tenga dos puntos.
 */
export const MOTIVOS_HANDOFF = [
  'explicit_request',
  'keyword',
  // HU-IA-07: una condición que escribió el admin. UN solo valor, no uno por condición: esta unión
  // la consumen `Cliente.handoffMotivo`, la auditoría, el DTO de la bandeja y `MOTIVO_LABEL`, y una
  // unión abierta haría que ese `Record` dejara de ser exhaustivo. Cuál fue viaja en `condicion`.
  'custom',
  'low_confidence',
  'intent_purchase',
] as const;

export type HandoffMotivo = (typeof MOTIVOS_HANDOFF)[number];

/** Escala del clasificador con la que se compara `intentPurchase.nivelMinimo`. */
export type NivelMinimoInteres = 'tibio' | 'caliente';

/**
 * Una condición de transferencia que creó el admin (HU-IA-07). Es un grupo de palabras **con
 * nombre**: lo que añade sobre `reglas.keyword` es poder encenderlas por separado y que la bandeja
 * diga cuál de ellas fue.
 *
 * Sin discriminante `tipo` **todavía**: hoy solo existe el tipo «palabras». La forma admite ganarlo
 * sin migrar nada, pero cada tipo nuevo es un evaluador nuevo en el worker, y eso es otra historia.
 */
export interface ICondicionExtra {
  /**
   * Slug derivado del nombre AL CREARLA; **no cambia al renombrarla**. Mismo criterio que
   * `contact_options.key` y `Cliente.atributos.key` (HU-CRM-02): renombrar no puede romper el
   * vínculo con las conversaciones que ya se transfirieron por esta condición.
   */
  key: string;
  nombre: string;
  activa: boolean;
  palabras: string[];
}

/**
 * A quién va la conversación (HU-IA-07). Antes de esta historia el destino era `asesorDestinoId`
 * con `null` = «el primero»; un segundo centinela no cabe en un campo `ObjectId | null`, así que la
 * estrategia pasa a ser explícita y `asesorDestinoId` solo significa algo con `'fijo'`.
 */
export type EstrategiaDestino = 'primero' | 'menor_carga' | 'fijo';

export interface IHandoffReglas {
  /** El cliente pide hablar con una persona, con las frases de fábrica o las que añada el admin. */
  explicitRequest: { activa: boolean; frases: string[] };
  /** Palabras que el admin quiere que escalen siempre ("factura", "reclamo", "cancelar"…). */
  keyword: { activa: boolean; palabras: string[] };
  /**
   * Sofi respondió que no sabe. `umbral` es la vía estricta opcional y solo puede exigir MÁS que
   * `KB_MIN_SCORE`: la recuperación ya descarta todo lo que esté por debajo, así que un umbral
   * menor describiría una regla que no puede dispararse nunca.
   */
  lowConfidence: { activa: boolean; umbral: number | null };
  /** El cliente muestra intención de compra según `AIService.classify()`. */
  intentPurchase: { activa: boolean; nivelMinimo: NivelMinimoInteres };
}

export interface IHandoffSettings {
  tenantId: Types.ObjectId;
  /**
   * Interruptor maestro. `false` de fábrica **a propósito**: esta historia no puede cambiarle el
   * comportamiento a ningún tenant que ya está en producción hasta que un admin lo encienda.
   */
  activo: boolean;
  /**
   * A quién se transfiere. `null` = al primer admin activo del tenant: no existe noción de
   * disponibilidad ni de carga, así que "el primero disponible" no puede significar otra cosa.
   */
  asesorDestinoId: Types.ObjectId | null;
  /**
   * Cómo se elige el destino. Opcional en lectura: los documentos guardados antes de HU-IA-07 no lo
   * tienen y `toDTO` lo deriva de `asesorDestinoId`, así que no hace falta migrar nada.
   */
  estrategiaDestino?: EstrategiaDestino;
  /** Lo que se le dice al cliente al transferirlo. Es copy de cara al cliente, lo edita el admin. */
  mensajeTransicion: string;
  reglas: IHandoffReglas;
  /** Condiciones propias del admin, además de las cuatro de fábrica. Opcional por lo mismo. */
  condicionesExtras?: ICondicionExtra[];
}

export interface IHandoffSettingsDocument extends IHandoffSettings, Document {}

/** Lo que ve el panel. Sin `tenantId`: nace del token y no viaja nunca en el cuerpo. */
export interface HandoffSettingsDTO {
  activo: boolean;
  asesorDestinoId: string | null;
  estrategiaDestino: EstrategiaDestino;
  mensajeTransicion: string;
  reglas: IHandoffReglas;
  condicionesExtras: ICondicionExtra[];
  /** `true` mientras la empresa no haya guardado nada y esté viendo los valores de fábrica. */
  heredado: boolean;
}

export type UpdateHandoffSettingsDTO = Omit<HandoffSettingsDTO, 'heredado'>;

/**
 * Resultado de evaluar los disparadores. Unión discriminada en vez de `{ dispara, motivo? }` para
 * que el compilador garantice que no se lee un motivo cuando no hubo handoff.
 */
export type HandoffDecision =
  | { dispara: false }
  | {
      dispara: true;
      motivo: HandoffMotivo;
      /**
       * Qué condición del admin disparó, cuando el motivo es `custom`. Viaja hasta
       * `handoffConversation`, que la guarda en el `Cliente`: el banner de la bandeja tiene que
       * poder decir «facturación» y no «escribió una palabra clave».
       */
      condicion?: IHandoffCondicionAplicada;
    };

/**
 * La condición tal como queda grabada en la conversación transferida (HU-IA-07).
 *
 * **Se guarda el nombre, no solo la clave.** Dos razones: el banner de la bandeja no puede leer la
 * configuración de handoff para pintar una línea, y sobre todo — si el admin renombra o borra la
 * condición mañana, esa conversación debe seguir diciendo por qué se transfirió **entonces**. Mismo
 * criterio con el que `lead.delete` guarda el lead entero en `antes`.
 */
export interface IHandoffCondicionAplicada {
  key: string;
  nombre: string;
}

/** Una fila del reparto de trabajo por asesor (HU-IA-07). */
export interface AsesorMetricasDTO {
  asesorId: string;
  nombre: string;
  /** Suma de los estados vivos. Es la cifra que gobierna el reparto por menor carga. */
  activas: number;
  /** Desglose completo, incluidos los cierres. Un asesor sin nada trae los cinco en 0. */
  porEstado: Record<string, number>;
}

export const NO_DISPARA: HandoffDecision = { dispara: false };

import type { ErrorGrafo } from '@sofiapp/shared';

export const TIPOS_NODO = [
  'mensaje',
  'captura',
  'condicion',
  'intencion',
  'kb',
  'accion',
  'handoff',
  'espera',
  'ia',
] as const;
export type TipoNodo = (typeof TIPOS_NODO)[number];

export const OPERADORES = ['igual_a', 'contiene', 'opcion_elegida'] as const;
export type OperadorCondicion = (typeof OPERADORES)[number];

export const OPERADOR_LABEL: Record<OperadorCondicion, string> = {
  igual_a: 'es igual a',
  contiene: 'contiene',
  opcion_elegida: 'opción elegida',
};

export type EstadoComercial = 'nuevo' | 'en_gestion' | 'pago_pendiente' | 'pagado' | 'perdido';

export interface IPosicion {
  x: number;
  y: number;
}

export interface IArista {
  id: string;
  from: string;
  to: string;
  condicion?: string;
}

export interface IRamaCondicion {
  operador: OperadorCondicion;
  valor: string;
  nodoDestino: string;
}

export interface IEtiquetaIntencion {
  etiqueta: string;
  descripcion: string;
  nodoDestino: string;
}

export interface ISalidaIa {
  etiqueta: string;
  descripcion: string;
  nodoDestino: string;
}

/** Dónde deja su dato un nodo `captura` (HU-FLOW-05). */
export const CAMPOS_FIJOS_CONTACTO = ['nombre', 'correo', 'documento', 'rolContacto'] as const;
export type CampoFijoContacto = (typeof CAMPOS_FIJOS_CONTACTO)[number];

export type DestinoCaptura =
  | { tipo: 'variable' }
  | { tipo: 'contacto'; campo: CampoFijoContacto }
  | { tipo: 'atributo'; key: string };

export type EfectoAccion =
  | { tipo: 'cambiar_estado'; estado: EstadoComercial }
  | { tipo: 'aplicar_etiquetas'; tagIds: string[] }
  | { tipo: 'crear_lead' }
  | { tipo: 'asignar_asesor'; asesorId: string };

export type ConfigNodo =
  | { tipo: 'mensaje'; texto?: string; templateId?: string; parametros?: string[] }
  | {
      tipo: 'captura';
      campo: string;
      descripcion: string;
      tipoDato: 'texto' | 'numero' | 'fecha' | 'booleano';
      pregunta: string;
      reintentos: number;
      /** Ausente en flujos anteriores a HU-FLOW-05: se trata como «solo en el flujo». */
      destino?: DestinoCaptura;
      /** Solo con destino de ficha. Por defecto `true`. */
      saltarSiExiste?: boolean;
      /** Solo con destino de ficha. Por defecto `false`. */
      sobrescribir?: boolean;
    }
  | { tipo: 'condicion'; variable: string; ramas: IRamaCondicion[]; ramaPorDefecto: string }
  | { tipo: 'intencion'; etiquetas: IEtiquetaIntencion[]; ramaPorDefecto: string }
  | { tipo: 'kb'; pregunta: string; kSobrescrito?: number; siNoHayRespuesta: string }
  | { tipo: 'accion'; efecto: EfectoAccion }
  | { tipo: 'handoff'; motivo?: string; notificarAsesorId?: string }
  | { tipo: 'espera'; minutos: number }
  | {
      tipo: 'ia';
      objetivo: string;
      salidas: ISalidaIa[];
      ramaPorDefecto: string;
      maxTurnos: number;
      usarKb: boolean;
    };

export interface INodo {
  id: string;
  /** Nombre propio que le da el usuario (HU-FLOW-05). Sin él se muestra el título del tipo. */
  nombre?: string;
  tipo: TipoNodo;
  posicion: IPosicion;
  config: ConfigNodo;
}

export type EstadoFlow = 'borrador' | 'publicado';

// ─── Disparador (HU-FLOW-04) ─────────────────────────────────────────────────────

export const TIPOS_TRIGGER = ['siempre', 'palabra_clave', 'primer_mensaje', 'horario'] as const;
export type TipoTrigger = (typeof TIPOS_TRIGGER)[number];

export interface IHorarioTrigger {
  /** 0 = domingo … 6 = sábado. */
  dias: number[];
  /** `HH:mm` en 24 h, en `zonaHoraria`. El rango es `[desde, hasta)`. */
  desde: string;
  hasta: string;
  zonaHoraria: string;
}

export interface ITriggerFlow {
  tipo: TipoTrigger;
  palabras?: string[];
  horario?: IHorarioTrigger;
}

export const TRIGGER_POR_DEFECTO: ITriggerFlow = { tipo: 'siempre' };

export interface FlowListItemDTO {
  id: string;
  nombre: string;
  version: number;
  estado: EstadoFlow;
  activo: boolean;
  updatedAt: string;
}

export interface FlowDTO {
  id: string;
  nombre: string;
  nodos: INodo[];
  aristas: IArista[];
  entrada: string;
  trigger: ITriggerFlow;
  version: number;
  estado: EstadoFlow;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveFlowPayload {
  nombre: string;
  nodos: INodo[];
  aristas: IArista[];
  entrada: string;
  trigger: ITriggerFlow;
  activo?: boolean;
  /** Confirma guardar DESACTIVADO un flujo activo que quedó con errores (HU-FLOW-05, criterio 23). */
  confirmarDesactivar?: boolean;
}

/** Respuesta de crear/actualizar: el flujo más lo que quedó pendiente de corregir (HU-FLOW-05). */
export interface FlowSaveDTO extends FlowDTO {
  advertencias: ErrorGrafo[];
  /** `true` si estaba activo y se guardó inactivo por `confirmarDesactivar`. */
  desactivado: boolean;
}

/**
 * Detalle de un error 400 de Zod, tal como lo arma `validate.middleware.ts` del backend:
 * `path` llega ya unido con puntos (`"body.nodos.0.config.ramas.0.nodoDestino"`), no como array.
 */
export interface ZodIssueDTO {
  path: string;
  message: string;
}

export interface ValidationErrorResponse {
  message: string;
  errors: ZodIssueDTO[];
}

/** Recordatorio de inactividad (HU-FLOW-02): política del tenant, no de un flujo concreto. */
export interface ReminderDTO {
  activo: boolean;
  antelacionMinutos: number;
  texto: string;
  templateId: string | null;
}

export interface UpdateReminderPayload {
  activo: boolean;
  antelacionMinutos: number;
  texto: string;
  templateId?: string;
}

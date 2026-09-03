import type { Document, Types } from 'mongoose';
import type { EstadoComercial } from '../cliente/cliente.types.js';
import type { SlotSpec } from '../../integrations/llm/llm-provider.types.js';

export const TIPOS_NODO = [
  'mensaje',
  'captura',
  'condicion',
  'intencion',
  'kb',
  'accion',
  'handoff',
  'espera',
] as const;
export type TipoNodo = (typeof TIPOS_NODO)[number];

/** `api` queda reservado en el enum de `docs/data-model.md` pero Zod lo rechaza en esta spec. */
export const TIPOS_NODO_RESERVADOS = ['api'] as const;

export const OPERADORES = ['igual_a', 'contiene', 'opcion_elegida'] as const;
export type OperadorCondicion = (typeof OPERADORES)[number];

export interface IArista {
  id: string;
  from: string;
  to: string;
  /** Etiqueta opcional para el canvas (p. ej. el texto de la rama); no la usa el motor. */
  condicion?: string;
}

export interface IPosicion {
  x: number;
  y: number;
}

interface INodoBase {
  id: string;
  posicion: IPosicion;
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

export type EfectoAccion =
  | { tipo: 'cambiar_estado'; estado: EstadoComercial }
  | { tipo: 'aplicar_etiquetas'; tagIds: string[] }
  | { tipo: 'crear_lead' }
  | { tipo: 'asignar_asesor'; asesorId: string };

/** Config por tipo de nodo. Unión discriminada por `tipo`: Zod la valida con `.strict()` por rama
 *  y TypeScript la estrecha. Es la pieza que hace estructural la regla anti-duplicación de KB —
 *  `condicion`/`intencion` no tienen NINGÚN campo de texto de respuesta. */
export type ConfigNodo =
  | { tipo: 'mensaje'; texto?: string; templateId?: string; parametros?: string[] }
  | {
      tipo: 'captura';
      campo: string;
      descripcion: string;
      tipoDato: 'texto' | 'numero' | 'fecha' | 'booleano';
      pregunta: string;
      reintentos: number;
    }
  | {
      tipo: 'condicion';
      /** `'ultimo_mensaje'` o `'var:<nombre>'`; la forma exacta la exige `flow.validation.ts`. */
      variable: string;
      ramas: IRamaCondicion[];
      ramaPorDefecto: string;
    }
  | { tipo: 'intencion'; etiquetas: IEtiquetaIntencion[]; ramaPorDefecto: string }
  | { tipo: 'kb'; pregunta: 'ultimo_mensaje' | string; kSobrescrito?: number; siNoHayRespuesta: string }
  | { tipo: 'accion'; efecto: EfectoAccion }
  | { tipo: 'handoff'; motivo?: string; notificarAsesorId?: string }
  | { tipo: 'espera'; minutos: number };

export interface INodo extends INodoBase {
  tipo: TipoNodo;
  config: ConfigNodo;
}

export type EstadoFlow = 'borrador' | 'publicado';

export interface IFlow {
  tenantId: Types.ObjectId;
  nombre: string;
  nodos: INodo[];
  aristas: IArista[];
  /** `id` del nodo por el que arranca la ejecución. */
  entrada: string;
  version: number;
  estado: EstadoFlow;
  activo: boolean;
}

export interface IFlowDocument extends IFlow, Document {}

/** Forma lean de un `Flow` con el `_id` y los timestamps que `IFlow` no lleva. La usa el runtime
 *  para saber a qué `flowId` atar el `FlowState` y el service para las respuestas HTTP. */
export interface IFlowLean extends IFlow {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFlowState {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  flowId: Types.ObjectId;
  nodoActualId: string;
  variables: Record<string, unknown>;
  /** `true` = el flujo está parado esperando algo (respuesta del cliente o resolución async). */
  esperandoRespuesta: boolean;
  /** `metaMessageId` del último mensaje ya procesado por este `FlowState` (idempotencia). */
  ultimoMetaMessageId?: string;
  actualizadoAt: Date;
}

export interface IFlowStateDocument extends IFlowState, Document {}

// ─── Motor puro (`flow.engine.ts`) ───────────────────────────────────────────────

/** Lo que el motor devuelve para que el runtime lo ejecute; nunca lo ejecuta el motor mismo. */
export type Efecto =
  | { tipo: 'enviar_mensaje'; texto?: string; templateId?: string; parametros?: string[] }
  | EfectoAccion
  | { tipo: 'handoff'; motivo?: string; notificarAsesorId?: string }
  | { tipo: 'error'; mensaje: string };

export interface EntradaMotor {
  flow: IFlow;
  /** `null` = la conversación aún no entró al flujo. */
  state: IFlowState | null;
  /** Texto del último mensaje del cliente que disparó esta invocación. */
  mensaje: string;
  /** Resultados de operaciones asíncronas resueltas FUERA del motor por el runtime. */
  resueltos?: {
    intencion?: string;
    capturado?: unknown;
    respuestaKb?: string;
  };
}

export type RequiereMotor =
  | { tipo: 'intencion'; etiquetas: string[] }
  | { tipo: 'kb'; pregunta: string; kSobrescrito?: number }
  | { tipo: 'captura'; spec: SlotSpec };

export interface SalidaMotor {
  /** `null` = el flujo terminó (o se detuvo, p. ej. por un `handoff`). */
  nodoSiguiente: string | null;
  /** Qué debe hacer el runtime, en orden. */
  efectos: Efecto[];
  variables: Record<string, unknown>;
  esperandoRespuesta: boolean;
  /** El motor pide una operación asíncrona y cede el control hasta tenerla resuelta. */
  requiere?: RequiereMotor;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateFlowDTO {
  nombre: string;
  nodos: INodo[];
  aristas: IArista[];
  entrada: string;
  activo?: boolean;
}

export interface UpdateFlowDTO {
  nombre?: string;
  nodos?: INodo[];
  aristas?: IArista[];
  entrada?: string;
  estado?: EstadoFlow;
  activo?: boolean;
}

export interface IFlowResponse {
  id: string;
  nombre: string;
  nodos: INodo[];
  aristas: IArista[];
  entrada: string;
  version: number;
  estado: EstadoFlow;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IFlowListItemResponse {
  id: string;
  nombre: string;
  version: number;
  estado: EstadoFlow;
  activo: boolean;
  updatedAt: string;
}

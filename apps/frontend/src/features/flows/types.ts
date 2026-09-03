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
    }
  | { tipo: 'condicion'; variable: string; ramas: IRamaCondicion[]; ramaPorDefecto: string }
  | { tipo: 'intencion'; etiquetas: IEtiquetaIntencion[]; ramaPorDefecto: string }
  | { tipo: 'kb'; pregunta: string; kSobrescrito?: number; siNoHayRespuesta: string }
  | { tipo: 'accion'; efecto: EfectoAccion }
  | { tipo: 'handoff'; motivo?: string; notificarAsesorId?: string }
  | { tipo: 'espera'; minutos: number };

export interface INodo {
  id: string;
  tipo: TipoNodo;
  posicion: IPosicion;
  config: ConfigNodo;
}

export type EstadoFlow = 'borrador' | 'publicado';

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
  activo?: boolean;
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

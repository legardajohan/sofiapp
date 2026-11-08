/**
 * Ventanas horarias de envío (HU-CONF-01). Espejo de `send-window.types.ts` del backend.
 */

export const CATEGORIAS_ENVIO = [
  'asesor',
  'plantilla_manual',
  'ia',
  'flujo',
  'recordatorio',
  'campana',
] as const;
export type CategoriaEnvio = (typeof CATEGORIAS_ENVIO)[number];

export type ModoRegla = 'libre' | 'restringido';
export type TipoExcepcion = 'cerrado' | 'franjas';

export interface Franja {
  /** 0 = domingo … 6 = sábado. */
  dias: number[];
  desde: string;
  hasta: string;
}

export type FranjaDia = Pick<Franja, 'desde' | 'hasta'>;

export interface Regla {
  categoria: CategoriaEnvio;
  modo: ModoRegla;
  franjas: Franja[];
}

export interface Excepcion {
  fecha: string;
  tipo: TipoExcepcion;
  franjas?: FranjaDia[];
  categorias?: CategoriaEnvio[];
  motivo?: string;
  origen?: 'manual' | 'festivo';
}

export interface PoliticaVentana {
  activo: boolean;
  zonaHoraria: string;
  reglas: Regla[];
  excepciones: Excepcion[];
}

export interface SendWindowConfig extends PoliticaVentana {
  configurado: boolean;
  version: number;
  updatedAt: string | null;
}

export interface EstadoCategoria {
  permitido: boolean;
  siguienteApertura: string | null;
  siguienteCierre: string | null;
}

export interface SendWindowStatus {
  activo: boolean;
  zonaHoraria: string;
  ahora: string;
  categorias: Record<CategoriaEnvio, EstadoCategoria>;
}

export interface Festivo {
  fecha: string;
  motivo: string;
}

export type ResultadoVentana =
  | { permitido: true; siguienteCierre: Date | null }
  | { permitido: false; siguienteApertura: Date | null; motivo: 'fuera_de_franja' | 'excepcion' };

export const MAX_FRANJAS_POR_REGLA = 10;
export const MAX_EXCEPCIONES = 200;
export const HORIZONTE_DIAS = 14;

/** Cómo se llama cada categoría en la interfaz y qué pasa con ella fuera de franja (fijo). */
export const CATEGORIA_INFO: Record<CategoriaEnvio, { nombre: string; descripcion: string; fueraDeFranja: string }> = {
  asesor: {
    nombre: 'Respuestas de asesores',
    descripcion: 'Lo que tu equipo escribe desde la bandeja: texto, archivos y notas de voz.',
    fueraDeFranja: 'Fuera de horario no se pueden enviar; la bandeja avisa cuándo vuelve a abrir.',
  },
  plantilla_manual: {
    nombre: 'Plantillas enviadas a mano',
    descripcion: 'Plantillas de WhatsApp que un asesor envía a un contacto desde la bandeja.',
    fueraDeFranja: 'Fuera de horario no se pueden enviar.',
  },
  ia: {
    nombre: 'Respuestas de Sofi',
    descripcion: 'Lo que responde el asistente y los flujos cuando un cliente escribe.',
    fueraDeFranja: 'Fuera de horario Sofi no responde y la conversación pasa a un asesor.',
  },
  flujo: {
    nombre: 'Mensajes diferidos de flujos',
    descripcion: 'Mensajes que un flujo envía después de una espera.',
    fueraDeFranja: 'Fuera de horario se aplazan hasta la siguiente apertura.',
  },
  recordatorio: {
    nombre: 'Recordatorios de conversación',
    descripcion: 'El aviso automático antes de que se cierre la ventana de 24 h.',
    fueraDeFranja:
      'Si la conversación vence fuera de horario, el recordatorio se adelanta al último momento abierto antes del cierre.',
  },
  campana: {
    nombre: 'Campañas',
    descripcion: 'Envíos masivos, inmediatos o programados.',
    fueraDeFranja: 'Fuera de horario la campaña se pausa sola y sigue en la siguiente apertura.',
  },
};

export const NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
/** Orden de la semana en la interfaz: de lunes a domingo. */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0] as const;

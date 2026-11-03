import type { Document, Types } from 'mongoose';

/**
 * Categorías de envío saliente (HU-CONF-01). Cada envío a un cliente declara la suya en
 * `ContextoEnvio.categoria`; la política de ventanas decide por categoría si puede salir ahora.
 * El comportamiento fuera de franja es FIJO por categoría (ver `docs/domain.md`):
 * `asesor`/`plantilla_manual` → 423 · `ia` → descartar y escalar · `flujo` → reprogramar ·
 * `recordatorio` → omitir · `campana` → retener.
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

export const MODOS_REGLA = ['libre', 'restringido'] as const;
export type ModoRegla = (typeof MODOS_REGLA)[number];

export const TIPOS_EXCEPCION = ['cerrado', 'franjas'] as const;
export type TipoExcepcion = (typeof TIPOS_EXCEPCION)[number];

/**
 * Franja semanal. `desde`/`hasta` en `HH:mm` local; `24:00` solo como fin. `desde > hasta` = la
 * franja cruza la medianoche y pertenece al día en que empieza.
 */
export interface IFranja {
  /** 0 = domingo … 6 = sábado. */
  dias: number[];
  desde: string;
  hasta: string;
}

export type IFranjaDia = Pick<IFranja, 'desde' | 'hasta'>;

export interface IRegla {
  categoria: CategoriaEnvio;
  modo: ModoRegla;
  franjas: IFranja[];
}

export interface IExcepcion {
  /** `YYYY-MM-DD` en la zona del tenant. */
  fecha: string;
  tipo: TipoExcepcion;
  /** Solo con `tipo: 'franjas'`: las únicas franjas abiertas ese día. */
  franjas?: IFranjaDia[];
  /** Vacío o ausente = aplica a todas las categorías. */
  categorias?: CategoriaEnvio[];
  motivo?: string;
  origen?: 'manual' | 'festivo';
}

/** Lo que la política necesita: la config sin metadatos de persistencia. */
export interface IPoliticaVentana {
  activo: boolean;
  zonaHoraria: string;
  reglas: IRegla[];
  excepciones: IExcepcion[];
}

export interface ISendWindowConfig extends IPoliticaVentana {
  tenantId: Types.ObjectId;
  actualizadoPor?: Types.ObjectId | null;
  version: number;
}

export interface ISendWindowConfigDocument extends ISendWindowConfig, Document {}

export type MotivoCierre = 'fuera_de_franja' | 'excepcion';

export type ResultadoVentana =
  | { permitido: true; siguienteCierre: Date | null }
  | { permitido: false; siguienteApertura: Date | null; motivo: MotivoCierre };

// ── DTOs ────────────────────────────────────────────────────────────────────

export type UpdateSendWindowDTO = IPoliticaVentana;

export interface ISendWindowResponse extends IPoliticaVentana {
  /** `false` = no hay documento: se devuelven los valores de fábrica. */
  configurado: boolean;
  version: number;
  updatedAt: string | null;
}

export interface IEstadoCategoriaResponse {
  permitido: boolean;
  siguienteApertura: string | null;
  siguienteCierre: string | null;
}

export interface ISendWindowStatusResponse {
  activo: boolean;
  zonaHoraria: string;
  ahora: string;
  categorias: Record<CategoriaEnvio, IEstadoCategoriaResponse>;
}

export interface IFestivoResponse {
  fecha: string;
  motivo: string;
}

export type AccionRetencion = 'bloqueado' | 'reprogramado' | 'descartado' | 'omitido' | 'retenido';

export interface IRetencionInput {
  categoria: CategoriaEnvio;
  accion: AccionRetencion;
  siguienteApertura: Date | null;
  clienteId?: string;
  campaignId?: string;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const ZONA_HORARIA_DEFECTO = 'America/Bogota';
export const MAX_FRANJAS_POR_REGLA = 10;
export const MAX_EXCEPCIONES = 200;
/** Horizonte de búsqueda de la siguiente apertura: sin apertura en este plazo → `null`. */
export const HORIZONTE_DIAS = 14;

const FRANJA_LABORAL: IFranja = { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '19:00' };

const MODO_DEFECTO: Record<CategoriaEnvio, ModoRegla> = {
  asesor: 'libre',
  plantilla_manual: 'restringido',
  ia: 'libre',
  flujo: 'restringido',
  recordatorio: 'restringido',
  campana: 'restringido',
};

/** Valores de fábrica. La política nace DESACTIVADA: desplegar no cambia ningún envío. */
export const CONFIG_DEFECTO: IPoliticaVentana = {
  activo: false,
  zonaHoraria: ZONA_HORARIA_DEFECTO,
  reglas: CATEGORIAS_ENVIO.map((categoria) => ({
    categoria,
    modo: MODO_DEFECTO[categoria],
    franjas: [{ ...FRANJA_LABORAL, dias: [...FRANJA_LABORAL.dias] }],
  })),
  excepciones: [],
};

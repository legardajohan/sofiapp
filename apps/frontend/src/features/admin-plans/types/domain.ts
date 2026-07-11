export interface IPlanLimites {
  usuarios: number;
  // `administradores` se agregó en la ampliación HU-SAAS-02 v2: los planes creados ANTES pueden no
  // tenerlo. Opcional para que la UI lo maneje de forma segura (formateo → "—").
  administradores?: number;
  mensajesMes: number;
  leads: number;
  campanasMes: number;
}

// Snapshot de un costo dentro de la fotografía financiera (dinero como string, ver ADR 0005).
export interface ICostoSnapshot {
  concepto: string;
  currency: 'COP' | 'USD';
  valorOriginal: string;
  tasaUsada?: string;
  valorConvertidoCop: string;
}

// Fotografía financiera del plan. Ausente en planes antiguos o sin catálogo de costos → "pendiente".
export interface IFotografiaFinanciera {
  trmOficial: string;
  fechaVigenciaTrm: string;
  proteccionCambiariaPct: number;
  tasaEfectiva: string;
  subtotalAdministradoresCop: string;
  costosUnitarios: ICostoSnapshot[];
  costoOperativoCop: string;
  utilidadPct: number;
  precioSugeridoCop: string;
  precioSugeridoUsd: string;
  precioFinalCop: string;
  precioFinalUsd: string;
}

// Estado de la TRM devuelta por GET /api/admin/exchange-rate/vigente.
export type EstadoTasa = 'CURRENT' | 'STALE' | 'MANUAL' | 'UNAVAILABLE';

export interface IExchangeRateResumen {
  tasaCopPorUsd: string; // decimal como string (ver ADR 0005)
  fuente: string;
  fechaVigencia: string;
}

export interface IExchangeRateVigente {
  estado: EstadoTasa;
  tasa: IExchangeRateResumen | null; // null solo cuando estado === 'UNAVAILABLE'
}

export interface IPlan {
  _id: string;
  nombre: string;
  descripcion?: string;
  limites: IPlanLimites;
  // Campos de la ampliación v2: opcionales para tolerar planes antiguos aún no migrados.
  perfilesPermitidos?: string[];
  numeroVersion?: number;
  fotografiaFinanciera?: IFotografiaFinanciera;
  precio: number;
  costoEstimado?: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

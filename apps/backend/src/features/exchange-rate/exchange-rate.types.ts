import type { Document, Types } from 'mongoose';
import type { z } from 'zod';
import type { manualRateSchema } from './exchange-rate.validation.js';

// Estado calculado de la tasa vigente (no se persiste fijo: se deriva al consultar).
export type EstadoTasa = 'CURRENT' | 'STALE' | 'MANUAL' | 'UNAVAILABLE';
export type TipoFuenteTasa = 'SUPERFINANCIERA' | 'BANCO_REPUBLICA' | 'MANUAL';

// `ExchangeRate` es un catálogo GLOBAL (sin `tenantId`), gestionado solo por el superadmin.
export interface IExchangeRate {
  monedaBase: 'USD';
  monedaCotizada: 'COP';
  tasaCopPorUsd: Types.Decimal128; // precisión decimal en persistencia
  fuente: string;
  tipoFuente: TipoFuenteTasa;
  fechaVigencia: Date;
  consultadaEn: Date;
  creadaPor?: string; // userId del superadmin (tasas manuales)
  esOficial: boolean;
  esOverrideManual: boolean;
  activoOverride: boolean; // permite revertir sin borrar el historial
  motivoOverride?: string;
  overrideExpiraEn?: Date;
}

export interface IExchangeRateDocument extends IExchangeRate, Document {}

export interface IExchangeRateResponse {
  _id: string;
  monedaBase: 'USD';
  monedaCotizada: 'COP';
  tasaCopPorUsd: string; // Decimal128 → string (sin pérdida de precisión en el JSON)
  fuente: string;
  tipoFuente: TipoFuenteTasa;
  fechaVigencia: string;
  consultadaEn: string;
  creadaPor?: string;
  esOficial: boolean;
  esOverrideManual: boolean;
  motivoOverride?: string;
  overrideExpiraEn?: string;
  createdAt: string;
}

// Tasa vigente + su estado calculado. `tasa` es `null` SOLO cuando `estado === 'UNAVAILABLE'`
// (nunca se devuelve 0 como tasa).
export interface IExchangeRateVigente {
  estado: EstadoTasa;
  tasa: IExchangeRateResponse | null;
}

export type RegisterManualRateDTO = z.infer<typeof manualRateSchema.shape.body>;

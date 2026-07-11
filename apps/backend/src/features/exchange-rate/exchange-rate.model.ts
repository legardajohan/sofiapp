import { Schema, model } from 'mongoose';
import type { IExchangeRateDocument } from './exchange-rate.types.js';

// Catálogo GLOBAL (sin `tenantId`), como `Plan`/`PlatformSettings`. Cada documento es un registro
// histórico (oficial o manual); la tasa "vigente" y su estado se calculan al consultar.
const ExchangeRateSchema = new Schema<IExchangeRateDocument>(
  {
    monedaBase: { type: String, required: true, enum: ['USD'], default: 'USD' },
    monedaCotizada: { type: String, required: true, enum: ['COP'], default: 'COP' },
    tasaCopPorUsd: { type: Schema.Types.Decimal128, required: true },
    fuente: { type: String, required: true },
    tipoFuente: {
      type: String,
      required: true,
      enum: ['SUPERFINANCIERA', 'BANCO_REPUBLICA', 'MANUAL'],
    },
    fechaVigencia: { type: Date, required: true },
    consultadaEn: { type: Date, required: true },
    creadaPor: { type: String },
    esOficial: { type: Boolean, required: true, default: false },
    esOverrideManual: { type: Boolean, required: true, default: false },
    activoOverride: { type: Boolean, required: true, default: false },
    motivoOverride: { type: String },
    overrideExpiraEn: { type: Date },
  },
  { timestamps: true },
);

// Consultas frecuentes: última oficial y override manual activo.
ExchangeRateSchema.index({ esOficial: 1, fechaVigencia: -1 });
ExchangeRateSchema.index({ esOverrideManual: 1, activoOverride: 1 });

export const ExchangeRate = model<IExchangeRateDocument>(
  'ExchangeRate',
  ExchangeRateSchema,
  'exchange_rates',
);

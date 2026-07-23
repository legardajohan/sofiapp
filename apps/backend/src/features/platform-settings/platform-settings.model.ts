import { Schema, model } from 'mongoose';
import type { IPlatformSettingsDocument } from './platform-settings.types.js';

// Config GLOBAL de plataforma (singleton, sin `tenantId`), análoga al catálogo `Plan`.
// El índice único sobre `clave` garantiza que exista UN solo documento ('global').
const PlatformSettingsSchema = new Schema<IPlatformSettingsDocument>(
  {
    clave: { type: String, required: true, unique: true, default: 'global' },
    maxAdministradoresPorPlan: { type: Number, required: true, min: 1, default: 100 },
    proteccionCambiariaPct: { type: Number, required: true, min: 0, max: 20, default: 0 },
    utilidadPorDefectoPct: { type: Number, required: true, min: 0, default: 30 },
  },
  { timestamps: true },
);

export const PlatformSettings = model<IPlatformSettingsDocument>(
  'PlatformSettings',
  PlatformSettingsSchema,
  'platform_settings',
);

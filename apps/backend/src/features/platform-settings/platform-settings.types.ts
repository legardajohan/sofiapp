import type { Document } from 'mongoose';
import type { z } from 'zod';
import type { updatePlatformSettingsSchema } from './platform-settings.validation.js';

// Configuración GLOBAL de plataforma (singleton, sin `tenantId`). La administra solo el superadmin.
// Concentra los límites técnicos y parámetros de costeo que NO deben repetirse por el código.
export interface IPlatformSettings {
  clave: string; // clave del singleton ('global')
  maxAdministradoresPorPlan: number; // tope técnico de administradores por plan (independiente del comercial)
  proteccionCambiariaPct: number; // 0–20 % (Fase D — costeo USD con tasa efectiva)
  utilidadPorDefectoPct: number; // % de utilidad sugerido por defecto (Fase D)
}

export interface IPlatformSettingsDocument extends IPlatformSettings, Document {}

export interface IPlatformSettingsResponse {
  maxAdministradoresPorPlan: number;
  proteccionCambiariaPct: number;
  utilidadPorDefectoPct: number;
  updatedAt: string;
}

// Zod = fuente única del tipo de entrada.
export type UpdatePlatformSettingsDTO = z.infer<typeof updatePlatformSettingsSchema.shape.body>;

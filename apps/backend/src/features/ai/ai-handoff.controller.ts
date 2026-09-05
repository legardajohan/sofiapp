import type { RequestHandler } from 'express';
import {
  getHandoffSettings,
  metricasPorAsesor,
  updateHandoffSettings,
} from './ai-handoff.service.js';
import type { UpdateHandoffSettingsValidatedBody } from './ai-handoff.validation.js';

export const getHandoffSettingsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getHandoffSettings(tenantId));
};

export const updateHandoffSettingsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as UpdateHandoffSettingsValidatedBody;
  res.status(200).json(await updateHandoffSettings(tenantId, dto));
};

/**
 * Cómo está repartido el trabajo entre los asesores (HU-IA-07). Es información PARA decidir el
 * destino de las transferencias, no un módulo de reportes: por eso vive en esta ruta y con estos
 * roles, junto a la configuración que se está editando.
 */
export const getAsesorMetricasController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await metricasPorAsesor(tenantId));
};

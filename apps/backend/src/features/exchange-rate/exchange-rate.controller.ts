import type { RequestHandler } from 'express';
import {
  getVigenteFresco,
  registerOficial,
  registerManual,
  revertToOficial,
  listHistorial,
} from './exchange-rate.service.js';
import { datosGovTrmProvider } from '../../integrations/trm/datos-gov-trm.provider.js';
import type { RegisterManualRateDTO } from './exchange-rate.types.js';

export const getVigenteController: RequestHandler = async (_req, res) => {
  // Devuelve la TRM vigente; si no hay una de hoy, la consulta a la fuente oficial (best-effort).
  res.json(await getVigenteFresco(datosGovTrmProvider));
};

export const refreshController: RequestHandler = async (_req, res) => {
  res.json(await registerOficial(datosGovTrmProvider));
};

export const registerManualController: RequestHandler = async (req, res) => {
  const usuarioId = req.user!.sub;
  res.status(201).json(await registerManual(req.body as RegisterManualRateDTO, usuarioId));
};

export const revertController: RequestHandler = async (_req, res) => {
  res.json(await revertToOficial());
};

export const historialController: RequestHandler = async (_req, res) => {
  res.json(await listHistorial());
};

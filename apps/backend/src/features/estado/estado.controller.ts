import type { Request, Response } from 'express';
import { createEstado, listEstados } from './estado.service.js';
import type { CreateEstadoBody } from './estado.validation.js';

export async function listEstadosController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();

  res.status(200).json(await listEstados(tenantId));
}

export async function createEstadoController(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!.toString();

  res.status(201).json(await createEstado(tenantId, req.body as CreateEstadoBody));
}

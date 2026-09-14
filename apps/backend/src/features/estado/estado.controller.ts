import type { RequestHandler } from 'express';
import {
  createEstado,
  deleteEstado,
  listEstados,
  reordenarEstados,
  updateEstado,
} from './estado.service.js';
import type {
  CreateEstadoBody,
  ListEstadosQuery,
  ReorderEstadosBody,
  UpdateEstadoBody,
} from './estado.validation.js';

export const listEstadosController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  // `req.validatedQuery`, no `req.query`: en Express 5 `query` es un getter que re-parsea el string
  // crudo y perdería lo que el schema ya validó (ver `validate.middleware`).
  const { uso } = req.validatedQuery as unknown as ListEstadosQuery;

  res.status(200).json(await listEstados(tenantId, { conUso: uso === 'true' }));
};

export const createEstadoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();

  res.status(201).json(await createEstado(tenantId, req.body as CreateEstadoBody));
};

/**
 * Devuelve el catálogo ya ordenado, no un `204`: quien arrastró tiene su lista en pantalla y la
 * respuesta le confirma cuál quedó, que es lo que distingue "se guardó" de "se pintó local".
 */
export const reorderEstadosController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { ids } = req.body as ReorderEstadosBody;

  res.status(200).json(await reordenarEstados(tenantId, ids));
};

export const updateEstadoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;

  res.status(200).json(await updateEstado(tenantId, id, req.body as UpdateEstadoBody));
};

/**
 * `204` y no `200` con cuerpo: aquí el borrado o sucede o falla. Cuando la etapa está en uso no se
 * archiva a escondidas —eso es un `PATCH` aparte que el administrador decide—, así que no hay un
 * "pasó otra cosa" que contar en la respuesta; el `409` lo explica con `motivo` y `enUso`.
 */
export const deleteEstadoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;

  await deleteEstado(tenantId, id);
  res.status(204).send();
};

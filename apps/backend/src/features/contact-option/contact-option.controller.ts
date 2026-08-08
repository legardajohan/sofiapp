import type { RequestHandler } from 'express';
import {
  createContactOption,
  deleteContactOption,
  listContactOptions,
  listContactOptionsByTipo,
  updateContactOption,
} from './contact-option.service.js';
import type {
  CreateContactOptionBody,
  ListContactOptionsQuery,
  UpdateContactOptionBody,
} from './contact-option.validation.js';

export const listContactOptionsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { tipo } = req.query as unknown as ListContactOptionsQuery;

  if (tipo) {
    res.status(200).json(await listContactOptionsByTipo(tenantId, tipo));
    return;
  }
  res.status(200).json(await listContactOptions(tenantId));
};

export const createContactOptionController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const opcion = await createContactOption(tenantId, req.body as CreateContactOptionBody);
  res.status(201).json(opcion);
};

export const updateContactOptionController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const opcion = await updateContactOption(tenantId, id, req.body as UpdateContactOptionBody);
  res.status(200).json(opcion);
};

/**
 * `200` y no `204`: el cuerpo dice si la opción se eliminó o solo se archivó por estar en uso, y la
 * UI necesita esa diferencia para explicarla en vez de dar por hecho que desapareció.
 */
export const deleteContactOptionController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await deleteContactOption(tenantId, id));
};

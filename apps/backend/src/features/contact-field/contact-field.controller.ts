import type { RequestHandler } from 'express';
import {
  archiveContactField,
  createContactField,
  listContactFields,
  updateContactField,
} from './contact-field.service.js';
import type {
  CreateContactFieldBody,
  ListContactFieldsQuery,
  UpdateContactFieldBody,
} from './contact-field.validation.js';

export const listContactFieldsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { incluirArchivados } = req.query as unknown as ListContactFieldsQuery;
  res.status(200).json(await listContactFields(tenantId, { incluirArchivados: incluirArchivados === 'true' }));
};

export const createContactFieldController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(201).json(await createContactField(tenantId, req.body as CreateContactFieldBody));
};

export const updateContactFieldController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await updateContactField(tenantId, id, req.body as UpdateContactFieldBody));
};

/** `204`: el borrado archiva; no hay nada que devolver (los contactos que lo tienen lo conservan). */
export const archiveContactFieldController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  await archiveContactField(tenantId, id);
  res.status(204).end();
};

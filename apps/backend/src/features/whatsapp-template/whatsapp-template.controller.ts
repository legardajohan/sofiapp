import type { RequestHandler } from 'express';
import { imagenDeArchivo } from '../media/media-upload.service.js';
import {
  createTemplate,
  getTemplate,
  listTemplates,
  subirMuestraPlantilla,
  syncTemplate,
  syncTemplates,
} from './whatsapp-template.service.js';
import type { CreateTemplateBody, ListTemplatesQuery } from './whatsapp-template.types.js';

export const listTemplatesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const query = req.validatedQuery as unknown as ListTemplatesQuery;
  const result = await listTemplates(tenantId, query);
  res.status(200).json(result);
};

export const createTemplateController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as CreateTemplateBody;
  const result = await createTemplate(tenantId, dto);
  res.status(201).json(result);
};

export const syncTemplatesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const result = await syncTemplates(tenantId);
  res.status(200).json(result);
};

/** Imagen de muestra de la cabecera (HT-WA-04). Responde el `uploadId` que consume el alta. */
export const uploadTemplateMediaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(201).json(await subirMuestraPlantilla(tenantId, imagenDeArchivo(req.file)));
};

export const getTemplateController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getTemplate(tenantId, req.params['id'] as string));
};

/** «Actualizar estado» de una plantilla concreta (HT-WA-04, criterio 6). */
export const syncTemplateController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await syncTemplate(tenantId, req.params['id'] as string));
};

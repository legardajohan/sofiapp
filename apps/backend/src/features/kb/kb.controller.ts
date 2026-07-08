import type { RequestHandler } from 'express';
import { createDocument, listDocuments } from './kb.service.js';
import type { CreateKbDocumentDTO } from './kb.types.js';

export const createDocumentController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as CreateKbDocumentDTO;
  const result = await createDocument(tenantId, dto);
  res.status(201).json(result);
};

export const listDocumentsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const result = await listDocuments(tenantId, page, limit);
  res.status(200).json(result);
};

import type { RequestHandler } from 'express';
import { createDocument, listDocuments, updateDocument, deleteDocument } from './kb.service.js';
import type { CreateKbDocumentDTO, UpdateKbDocumentDTO } from './kb.types.js';

export const createDocumentController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as CreateKbDocumentDTO;
  const result = await createDocument(tenantId, dto);
  res.status(201).json(result);
};

export const updateDocumentController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { id } = req.params as { id: string };
  const { contenido } = req.body as UpdateKbDocumentDTO;
  const result = await updateDocument(tenantId, id, contenido);
  res.status(200).json(result);
};

export const listDocumentsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const result = await listDocuments(tenantId, page, limit);
  res.status(200).json(result);
};

export const deleteDocumentController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { id } = req.params as { id: string };
  const result = await deleteDocument(tenantId, id);
  res.status(200).json(result);
};

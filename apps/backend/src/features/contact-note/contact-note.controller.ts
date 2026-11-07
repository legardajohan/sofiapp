import type { RequestHandler } from 'express';
import { createNota, deleteNota, listNotas, updateNota } from './contact-note.service.js';
import type {
  CreateNotaBody,
  ListNotasQuery,
  UpdateNotaBody,
} from './contact-note.validation.js';

export const createNotaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const clienteId = req.params['clienteId'] as string;
  const { texto, ...opciones } = req.body as CreateNotaBody;
  const nota = await createNota(tenantId, req.user!.sub, clienteId, texto, opciones);
  res.status(201).json(nota);
};

export const listNotasController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const clienteId = req.params['clienteId'] as string;
  // `req.validatedQuery`, no `req.query`: en Express 5 `query` re-parsea el string crudo y perdería
  // la coerción y los defaults de Zod.
  const { page, limit } = req.validatedQuery as unknown as ListNotasQuery;
  const notas = await listNotas(tenantId, clienteId, page, limit);
  res.status(200).json(notas);
};

export const updateNotaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const clienteId = req.params['clienteId'] as string;
  const notaId = req.params['notaId'] as string;
  const nota = await updateNota(
    tenantId,
    req.user!.sub,
    clienteId,
    notaId,
    req.body as UpdateNotaBody,
  );
  res.status(200).json(nota);
};

export const deleteNotaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const clienteId = req.params['clienteId'] as string;
  const notaId = req.params['notaId'] as string;
  await deleteNota(tenantId, req.user!.sub, clienteId, notaId);
  res.status(204).end();
};

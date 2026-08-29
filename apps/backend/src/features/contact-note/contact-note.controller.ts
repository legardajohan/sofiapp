import type { RequestHandler } from 'express';
import { createNota, listNotas } from './contact-note.service.js';
import type { CreateNotaBody, ListNotasQuery } from './contact-note.validation.js';

export const createNotaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const clienteId = req.params['clienteId'] as string;
  const { texto } = req.body as CreateNotaBody;
  const nota = await createNota(tenantId, req.user!.sub, clienteId, texto);
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

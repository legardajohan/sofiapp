import type { RequestHandler } from 'express';
import {
  cerrarPendiente,
  generarReportePendientes,
  listPendientes,
  reabrirPendiente,
} from './pendiente.service.js';
import type { ListPendientesQuery, PdfPendientesQuery } from './pendiente.validation.js';

export const listPendientesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  // `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo.
  const { estado, page, limit } = req.validatedQuery as unknown as ListPendientesQuery;
  res.status(200).json(await listPendientes(tenantId, estado, page, limit));
};

export const cerrarPendienteController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await cerrarPendiente(tenantId, req.user!.sub, id));
};

export const reabrirPendienteController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.status(200).json(await reabrirPendiente(tenantId, req.user!.sub, id));
};

export const pdfPendientesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const query = req.validatedQuery as unknown as PdfPendientesQuery;
  const { documento, filename } = await generarReportePendientes(tenantId, req.user!.sub, query);
  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  documento.pipe(res);
};

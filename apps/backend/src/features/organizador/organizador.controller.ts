import type { RequestHandler } from 'express';
import {
  cerrarConMotivo,
  conteosOrganizador,
  crearMotivo,
  getPreferencia,
  historialPendiente,
  listActividad,
  listActivos,
  listMotivos,
  listOrganizador,
  posponer,
  setPreferencia,
} from './organizador.service.js';
import type {
  ActividadQuery,
  CerrarBody,
  ConteosQuery,
  ListOrganizadorQuery,
  PosponerBody,
} from './organizador.validation.js';

// `validatedQuery`, no `req.query`: en Express 5 el getter re-parsea el query string crudo.

export const getPreferenciaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getPreferencia(tenantId, req.user!.sub));
};

export const setPreferenciaController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { activo } = req.body as { activo: boolean };
  res.status(200).json(await setPreferencia(tenantId, req.user!.sub, activo));
};

export const listOrganizadorController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const query = req.validatedQuery as unknown as ListOrganizadorQuery;
  res.status(200).json(await listOrganizador(tenantId, query));
};

export const conteosController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const query = req.validatedQuery as unknown as ConteosQuery;
  res.status(200).json(await conteosOrganizador(tenantId, query));
};

export const activosController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await listActivos(tenantId, req.user!.sub));
};

export const historialPendienteController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await historialPendiente(tenantId, req.params['id'] as string));
};

export const actividadController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const query = req.validatedQuery as unknown as ActividadQuery;
  res.status(200).json(await listActividad(tenantId, query));
};

export const cerrarController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const body = req.body as CerrarBody;
  res
    .status(200)
    .json(await cerrarConMotivo(tenantId, req.user!.sub, req.params['id'] as string, body));
};

export const posponerController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const body = req.body as PosponerBody;
  res.status(200).json(await posponer(tenantId, req.user!.sub, req.params['id'] as string, body));
};

export const listMotivosController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await listMotivos(tenantId));
};

export const crearMotivoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { nombre } = req.body as { nombre: string };
  res.status(201).json(await crearMotivo(tenantId, req.user!.sub, nombre));
};

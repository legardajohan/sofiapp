import type { RequestHandler } from 'express';
import {
  createTenantUser,
  getTenantUser,
  listManageableUsers,
  listTenantUsers,
  resetTenantUserPassword,
  setTenantUserEstado,
  updateTenantUser,
  type UserActor,
} from './user.service.js';
import type {
  CreateUserBody,
  ListUsersQuery,
  ManageUsersQuery,
  ResetUserPasswordBody,
  SetUserEstadoBody,
  UpdateUserBody,
} from './user.validation.js';

function actorDe(req: Parameters<RequestHandler>[0]): UserActor {
  const { sub, rol, subrol } = req.user!;
  return { sub, rol, subrol };
}

export const listUsersController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const users = await listTenantUsers(tenantId, req.validatedQuery as unknown as ListUsersQuery);
  res.status(200).json(users);
};

export const manageUsersController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const users = await listManageableUsers(tenantId, req.validatedQuery as unknown as ManageUsersQuery);
  res.status(200).json(users);
};

export const getUserController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await getTenantUser(tenantId, String(req.params['id'])));
};

export const createUserController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const user = await createTenantUser(tenantId, actorDe(req), req.body as CreateUserBody);
  res.status(201).json(user);
};

export const updateUserController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const user = await updateTenantUser(
    tenantId,
    actorDe(req),
    String(req.params['id']),
    req.body as UpdateUserBody,
  );
  res.status(200).json(user);
};

export const setUserEstadoController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const user = await setTenantUserEstado(
    tenantId,
    actorDe(req),
    String(req.params['id']),
    req.body as SetUserEstadoBody,
  );
  res.status(200).json(user);
};

export const resetUserPasswordController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { password } = req.body as ResetUserPasswordBody;
  await resetTenantUserPassword(tenantId, actorDe(req), String(req.params['id']), password);
  res.status(204).end();
};

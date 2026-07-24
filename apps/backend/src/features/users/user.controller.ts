import type { RequestHandler } from 'express';
import { listTenantUsers } from './user.service.js';
import type { ListUsersQuery } from './user.validation.js';

export const listUsersController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const users = await listTenantUsers(tenantId, req.validatedQuery as unknown as ListUsersQuery);
  res.status(200).json(users);
};

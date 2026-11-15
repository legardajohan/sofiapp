import type { RequestHandler } from 'express';
import { setAuthCookies, clearAuthCookies } from '../../utils/cookies.util.js';
import { login, getProfile, changeOwnPassword } from './auth.service.js';
import type { ChangeOwnPasswordDTO, LoginDTO } from './auth.types.js';

export const loginController: RequestHandler = async (req, res) => {
  const dto = req.body as LoginDTO;
  const { token, csrfToken, session } = await login(dto.email, dto.password);
  setAuthCookies(res, token, csrfToken);
  res.status(200).json(session);
};

export const meController: RequestHandler = async (req, res) => {
  const sub = req.user!.sub;
  const session = await getProfile(sub);
  res.status(200).json(session);
};

export const logoutController: RequestHandler = (_req, res) => {
  clearAuthCookies(res);
  res.status(204).end();
};

export const changeOwnPasswordController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const dto = req.body as ChangeOwnPasswordDTO;
  const { token, csrfToken } = await changeOwnPassword(tenantId, req.user!.sub, dto.actual, dto.nueva);
  setAuthCookies(res, token, csrfToken);
  res.status(204).end();
};

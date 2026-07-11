import type { RequestHandler } from 'express';
import {
  getBaseProfiles,
  listAdminProfiles,
  createAdminProfile,
  updateAdminProfile,
  deleteAdminProfile,
} from './admin-profile.service.js';
import type { CreateAdminProfileDTO, UpdateAdminProfileDTO } from './admin-profile.types.js';

export const getBaseProfilesController: RequestHandler = (_req, res) => {
  res.json(getBaseProfiles());
};

export const listAdminProfilesController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.json(await listAdminProfiles(tenantId));
};

export const createAdminProfileController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const profile = await createAdminProfile(tenantId, req.body as CreateAdminProfileDTO);
  res.status(201).json(profile);
};

export const updateAdminProfileController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  res.json(await updateAdminProfile(tenantId, id, req.body as UpdateAdminProfileDTO));
};

export const deleteAdminProfileController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  await deleteAdminProfile(tenantId, id);
  res.status(204).send();
};

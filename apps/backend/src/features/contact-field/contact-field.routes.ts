import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  authorizeRolEmpresa,
  ROLES_CONFIGURACION,
} from '../../middlewares/authorize-rol-empresa.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  archiveContactFieldSchema,
  createContactFieldSchema,
  listContactFieldsSchema,
  updateContactFieldSchema,
} from './contact-field.validation.js';
import {
  archiveContactFieldController,
  createContactFieldController,
  listContactFieldsController,
  updateContactFieldController,
} from './contact-field.controller.js';

const router = Router();

// Mismo rol que el resto de catálogos del contacto (`contact-option`): se gestiona desde el editor de
// flujos y desde la ficha.
const catalogoRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  validate(listContactFieldsSchema),
  asyncHandler(listContactFieldsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(createContactFieldSchema),
  asyncHandler(createContactFieldController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(updateContactFieldSchema),
  asyncHandler(updateContactFieldController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(archiveContactFieldSchema),
  asyncHandler(archiveContactFieldController),
);

export default router;

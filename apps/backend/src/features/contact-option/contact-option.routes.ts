import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createContactOptionSchema,
  deleteContactOptionSchema,
  listContactOptionsSchema,
  updateContactOptionSchema,
} from './contact-option.validation.js';
import {
  createContactOptionController,
  deleteContactOptionController,
  listContactOptionsController,
  updateContactOptionController,
} from './contact-option.controller.js';

const router = Router();

// Mismos roles que la bandeja y las etiquetas: el catálogo se gestiona desde la ficha del contacto.
// SIN `authorizeSubrol`: interés, objeción y rol NO son datos sensibles (el gate del criterio 5 de
// HU-CRM-02 cubre correo, documento y atributos marcados), y cerrarlo por subrol le quitaría al
// `coordinator` una edición que la propia spec le reconoce (criterio 6).
const catalogoRoles = authorize(['admin']);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  validate(listContactOptionsSchema),
  asyncHandler(listContactOptionsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  validate(createContactOptionSchema),
  asyncHandler(createContactOptionController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  validate(updateContactOptionSchema),
  asyncHandler(updateContactOptionController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  catalogoRoles,
  validate(deleteContactOptionSchema),
  asyncHandler(deleteContactOptionController),
);

export default router;

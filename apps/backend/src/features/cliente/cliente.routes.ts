import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { extractSchema, historySchema, updateClienteSchema } from './cliente.validation.js';
import {
  extractContactDataController,
  getContactHistoryController,
  updateClienteController,
} from './cliente.controller.js';

const router = Router();

// Mismos roles que la bandeja (HU-OMNI-01): la ficha se abre desde una conversación.
const bandejaRoles = authorize(['admin']);

router.get(
  '/:id/history',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(historySchema),
  asyncHandler(getContactHistoryController),
);

router.post(
  '/:id/extract',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(extractSchema),
  asyncHandler(extractContactDataController),
);

// Edición de la ficha (HU-CRM-02). SIN `authorizeSubrol`: el gate de los datos sensibles es por
// campo, dentro del service, para no quitarle al `coordinator` la edición de los no sensibles.
router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(updateClienteSchema),
  asyncHandler(updateClienteController),
);

export default router;

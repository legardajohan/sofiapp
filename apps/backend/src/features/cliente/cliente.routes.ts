import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { historySchema } from './cliente.validation.js';
import { getContactHistoryController } from './cliente.controller.js';

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

export default router;

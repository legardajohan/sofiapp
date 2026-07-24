import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { listUsersSchema } from './user.validation.js';
import { listUsersController } from './user.controller.js';

const router = Router();

// Lectura de los administradores del propio tenant (alimenta el selector de asignación de HU-OMNI-02).
router.get(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(listUsersSchema),
  asyncHandler(listUsersController),
);

export default router;

import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { changeOwnPasswordSchema, loginSchema } from './auth.validation.js';
import {
  changeOwnPasswordController,
  loginController,
  meController,
  logoutController,
} from './auth.controller.js';

const router = Router();

router.post('/login', validate(loginSchema), asyncHandler(loginController));

router.get('/me', authenticateJWT, asyncHandler(meController));

router.post('/logout', authenticateJWT, asyncHandler(logoutController));

// AUTH-05: cualquier usuario de empresa cambia su contraseña con la actual (el superadmin, no).
router.patch(
  '/me/password',
  authenticateJWT,
  requireTenant,
  validate(changeOwnPasswordSchema),
  asyncHandler(changeOwnPasswordController),
);

export default router;

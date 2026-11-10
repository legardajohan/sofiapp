import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  authorizeSubrol,
  SUBROLES_GESTION_USUARIOS,
} from '../../middlewares/authorize-subrol.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createUserSchema,
  getUserSchema,
  listUsersSchema,
  manageUsersSchema,
  resetUserPasswordSchema,
  setUserEstadoSchema,
  updateUserSchema,
} from './user.validation.js';
import {
  createUserController,
  getUserController,
  listUsersController,
  manageUsersController,
  resetUserPasswordController,
  setUserEstadoController,
  updateUserController,
} from './user.controller.js';

const router = Router();

// Lectura de los administradores del propio tenant (alimenta el selector de asignación de HU-OMNI-02).
// Abierta a todo admin: no es gestión, es elegir a quién asignar.
router.get(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(listUsersSchema),
  asyncHandler(listUsersController),
);

// ── Gestión de usuarios (AUTH-03): solo director y propietario (ADR 0016) ──────────────────────
const gestion = [authorize(['admin']), authorizeSubrol(SUBROLES_GESTION_USUARIOS)];

// `/manage` va antes de `/:id` para que no lo capture como un id.
router.get(
  '/manage',
  authenticateJWT,
  requireTenant,
  ...gestion,
  validate(manageUsersSchema),
  asyncHandler(manageUsersController),
);

router.get(
  '/:id',
  authenticateJWT,
  requireTenant,
  ...gestion,
  validate(getUserSchema),
  asyncHandler(getUserController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  ...gestion,
  validate(createUserSchema),
  asyncHandler(createUserController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  ...gestion,
  validate(updateUserSchema),
  asyncHandler(updateUserController),
);

router.patch(
  '/:id/estado',
  authenticateJWT,
  requireTenant,
  ...gestion,
  validate(setUserEstadoSchema),
  asyncHandler(setUserEstadoController),
);

router.post(
  '/:id/password',
  authenticateJWT,
  requireTenant,
  ...gestion,
  validate(resetUserPasswordSchema),
  asyncHandler(resetUserPasswordController),
);

export default router;

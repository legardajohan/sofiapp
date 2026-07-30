import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { createLeadSchema, deleteLeadSchema, getLeadSchema } from './lead.validation.js';
import {
  createLeadController,
  deleteLeadController,
  getLeadController,
} from './lead.controller.js';

const router = Router();

// Mismos roles que la bandeja: el lead nace desde una conversación.
const leadRoles = authorize(['admin']);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(createLeadSchema),
  asyncHandler(createLeadController),
);

router.get(
  '/:id',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(getLeadSchema),
  asyncHandler(getLeadController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  leadRoles,
  validate(deleteLeadSchema),
  asyncHandler(deleteLeadController),
);

export default router;

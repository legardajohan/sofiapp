import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createTemplateSchema,
  listTemplatesSchema,
  syncTemplatesSchema,
} from './whatsapp-template.validation.js';
import {
  createTemplateController,
  listTemplatesController,
  syncTemplatesController,
} from './whatsapp-template.controller.js';

const router: ExpressRouter = Router();

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(listTemplatesSchema),
  asyncHandler(listTemplatesController),
);

router.post(
  '/sync',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(syncTemplatesSchema),
  asyncHandler(syncTemplatesController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(createTemplateSchema),
  asyncHandler(createTemplateController),
);

export default router;

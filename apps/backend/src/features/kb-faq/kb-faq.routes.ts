import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createFaqSchema,
  deleteFaqSchema,
  listFaqsSchema,
  testFaqSchema,
  updateFaqSchema,
} from './kb-faq.validation.js';
import {
  createFaqController,
  deleteFaqController,
  listFaqsController,
  testFaqController,
  updateFaqController,
} from './kb-faq.controller.js';

const router: ExpressRouter = Router();

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(listFaqsSchema),
  asyncHandler(listFaqsController),
);

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(createFaqSchema),
  asyncHandler(createFaqController),
);

// Antes de '/:id' por higiene: 'test' nunca debe interpretarse como un id.
router.post(
  '/test',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(testFaqSchema),
  asyncHandler(testFaqController),
);

router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(updateFaqSchema),
  asyncHandler(updateFaqController),
);

router.delete(
  '/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(deleteFaqSchema),
  asyncHandler(deleteFaqController),
);

export default router;

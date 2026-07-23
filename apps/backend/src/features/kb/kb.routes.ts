import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { createDocumentSchema, listDocumentsSchema, deleteDocumentSchema } from './kb.validation.js';
import {
  createDocumentController,
  listDocumentsController,
  deleteDocumentController,
} from './kb.controller.js';

const router: ExpressRouter = Router();

router.post(
  '/documents',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(createDocumentSchema),
  asyncHandler(createDocumentController),
);

router.get(
  '/documents',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(listDocumentsSchema),
  asyncHandler(listDocumentsController),
);

router.delete(
  '/documents/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  validate(deleteDocumentSchema),
  asyncHandler(deleteDocumentController),
);

export default router;

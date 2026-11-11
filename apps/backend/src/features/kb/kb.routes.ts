import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  authorizeRolEmpresa,
  ROLES_CONFIGURACION,
} from '../../middlewares/authorize-rol-empresa.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createDocumentSchema,
  listDocumentsSchema,
  updateDocumentSchema,
  deleteDocumentSchema,
} from './kb.validation.js';
import {
  createDocumentController,
  listDocumentsController,
  updateDocumentController,
  deleteDocumentController,
} from './kb.controller.js';

const router: ExpressRouter = Router();

router.post(
  '/documents',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(createDocumentSchema),
  asyncHandler(createDocumentController),
);

router.get(
  '/documents',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(listDocumentsSchema),
  asyncHandler(listDocumentsController),
);

router.patch(
  '/documents/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(updateDocumentSchema),
  asyncHandler(updateDocumentController),
);

router.delete(
  '/documents/:id',
  authenticateJWT,
  requireTenant,
  authorize(['admin']),
  authorizeRolEmpresa(ROLES_CONFIGURACION),
  validate(deleteDocumentSchema),
  asyncHandler(deleteDocumentController),
);

export default router;

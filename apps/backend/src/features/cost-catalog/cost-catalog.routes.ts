import { Router, type Router as ExpressRouter } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  createCostItemSchema,
  updateCostItemSchema,
  costItemIdParamSchema,
} from './cost-catalog.validation.js';
import {
  listCostItemsController,
  createCostItemController,
  updateCostItemController,
  deleteCostItemController,
} from './cost-catalog.controller.js';

const router: ExpressRouter = Router();

// Catálogo de costos GLOBAL (superadmin, cross-tenant): SIN requireTenant.
router.get('/', authenticateJWT, authorize(['superadmin']), asyncHandler(listCostItemsController));

router.post(
  '/',
  authenticateJWT,
  authorize(['superadmin']),
  validate(createCostItemSchema),
  asyncHandler(createCostItemController),
);

router.patch(
  '/:id',
  authenticateJWT,
  authorize(['superadmin']),
  validate(updateCostItemSchema),
  asyncHandler(updateCostItemController),
);

router.delete(
  '/:id',
  authenticateJWT,
  authorize(['superadmin']),
  validate(costItemIdParamSchema),
  asyncHandler(deleteCostItemController),
);

export default router;

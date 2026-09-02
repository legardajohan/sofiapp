import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  confirmarExtraccionSchema,
  extractSchema,
  historySchema,
  updateClienteSchema,
} from './cliente.validation.js';
import {
  confirmarExtraccionController,
  extractContactDataController,
  getContactHistoryController,
  updateClienteController,
} from './cliente.controller.js';

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

router.post(
  '/:id/extract',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(extractSchema),
  asyncHandler(extractContactDataController),
);

// Confirmar los datos extraídos (HU-IA-06). SIN `authorizeSubrol`, por el mismo motivo que el PATCH
// de abajo: el gate del correo es por campo, dentro del service, para que un `coordinator` pueda
// confirmar el nombre y el interés aunque no pueda tocar el correo.
router.post(
  '/:id/extract/confirm',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(confirmarExtraccionSchema),
  asyncHandler(confirmarExtraccionController),
);

// Edición de la ficha (HU-CRM-02). SIN `authorizeSubrol`: el gate de los datos sensibles es por
// campo, dentro del service, para no quitarle al `coordinator` la edición de los no sensibles.
router.patch(
  '/:id',
  authenticateJWT,
  requireTenant,
  bandejaRoles,
  validate(updateClienteSchema),
  asyncHandler(updateClienteController),
);

export default router;

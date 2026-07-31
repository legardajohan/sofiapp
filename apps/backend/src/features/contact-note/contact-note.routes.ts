import { Router } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  SUBROLES_DATOS_SENSIBLES,
  authorizeSubrol,
} from '../../middlewares/authorize-subrol.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import { createNotaSchema, listNotasSchema } from './contact-note.validation.js';
import { createNotaController, listNotasController } from './contact-note.controller.js';

// `mergeParams` para que `:clienteId` del montaje (`/api/clientes/:clienteId/notas`) llegue a los
// controllers y a los schemas de params.
const router = Router({ mergeParams: true });

// A diferencia del PATCH de la ficha, aquí el gate va a nivel de ruta: la nota es sensible entera,
// no por campos, y no hay forma de enmascarar prosa libre selectivamente.
const notasRoles = [authorize(['admin']), authorizeSubrol(SUBROLES_DATOS_SENSIBLES)];

router.post(
  '/',
  authenticateJWT,
  requireTenant,
  ...notasRoles,
  validate(createNotaSchema),
  asyncHandler(createNotaController),
);

router.get(
  '/',
  authenticateJWT,
  requireTenant,
  ...notasRoles,
  validate(listNotasSchema),
  asyncHandler(listNotasController),
);

export default router;

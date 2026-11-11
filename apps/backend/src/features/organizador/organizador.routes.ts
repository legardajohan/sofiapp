import { Router } from 'express';
import type { RequestHandler } from 'express';
import { authenticateJWT } from '../../middlewares/authenticate-jwt.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { authorize } from '../../middlewares/authorize.middleware.js';
import {
  SUBROLES_DATOS_SENSIBLES,
  authorizeSubrol,
} from '../../middlewares/authorize-subrol.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../middlewares/async-handler.middleware.js';
import {
  activosSchema,
  actividadSchema,
  cerrarSchema,
  conteosSchema,
  crearMotivoSchema,
  getPreferenciaSchema,
  historialPendienteSchema,
  listMotivosSchema,
  listOrganizadorSchema,
  posponerSchema,
  setPreferenciaSchema,
} from './organizador.validation.js';
import {
  activosController,
  actividadController,
  cerrarController,
  conteosController,
  crearMotivoController,
  getPreferenciaController,
  historialPendienteController,
  listMotivosController,
  listOrganizadorController,
  posponerController,
  setPreferenciaController,
} from './organizador.controller.js';

const router = Router();

// El Organizador muestra el texto de las notas: mismo gate que las notas y la columna Pendientes
// (RN8 de HU-PDF-01, ADR 0006). Quien no puede leer notas tampoco recibe sus recordatorios.
const organizadorRoles = [authorize(['admin']), authorizeSubrol(SUBROLES_DATOS_SENSIBLES)];

function cadena(schema: Parameters<typeof validate>[0], controller: RequestHandler): RequestHandler[] {
  return [
    authenticateJWT,
    requireTenant,
    ...organizadorRoles,
    validate(schema),
    asyncHandler(controller),
  ];
}

router.get('/preferencias', ...cadena(getPreferenciaSchema, getPreferenciaController));
router.put('/preferencias', ...cadena(setPreferenciaSchema, setPreferenciaController));
router.get('/pendientes', ...cadena(listOrganizadorSchema, listOrganizadorController));
router.get('/conteos', ...cadena(conteosSchema, conteosController));
router.get('/activos', ...cadena(activosSchema, activosController));
router.get('/historial', ...cadena(actividadSchema, actividadController));
router.get(
  '/pendientes/:id/historial',
  ...cadena(historialPendienteSchema, historialPendienteController),
);
// Transiciones: POST, como `cerrar`/`reabrir` de HU-PDF-01.
router.post('/pendientes/:id/cerrar', ...cadena(cerrarSchema, cerrarController));
router.post('/pendientes/:id/posponer', ...cadena(posponerSchema, posponerController));
router.get('/motivos-cierre', ...cadena(listMotivosSchema, listMotivosController));
router.post('/motivos-cierre', ...cadena(crearMotivoSchema, crearMotivoController));

export default router;

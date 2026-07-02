import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error.middleware.js';
import tenantAdminRoutes from './features/tenant/tenant.routes.js';

const app: Express = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

// Healthcheck (público)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Rutas de Superadmin (cross-tenant, sin requireTenant)
app.use('/api/admin/tenants', tenantAdminRoutes);

// ⚠️  RUTAS TENANT-AWARE (fase 2+): cuando se monten endpoints que pertenecen a un tenant específico,
// deben encadenarse así:
//   router.<method>('<path>',
//     authenticateJWT,              // 1. Autentica y carga req.user (con tenantId)
//     requireTenant,                // 2. Valida que req.user.tenantId exista
//     authorize([/* roles */]),     // 3. Autoriza por rol
//     requireActiveTenant,          // 4. Valida que el tenant esté en estado 'activo'
//     validate(<schema>),           // 5. Valida entrada con Zod
//     asyncHandler(<controller>)    // 6. Ejecuta el controller
//   );
// Ejemplo futura ruta de clientes:
//   app.use('/api/clientes', clientesRoutes);
// Ver docs/multi-tenancy.md para reglas de aislamiento y docs/architecture.md para pipeline completo.

// Error handler central (siempre al final)
app.use(errorHandler);

export default app;

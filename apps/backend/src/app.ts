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

// Rutas de Superadmin
app.use('/api/admin/tenants', tenantAdminRoutes);

// Error handler central (siempre al final)
app.use(errorHandler);

export default app;

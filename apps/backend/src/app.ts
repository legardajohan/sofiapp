import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import { csrfGuard } from './middlewares/csrf.middleware.js';
import { seedSuperadmin } from './seed/seed-superadmin.js';
import { createSocketGateway } from './realtime/socket.gateway.js';
import { subscribeRealtime } from './realtime/realtime.publisher.js';
import authRoutes from './features/auth/auth.routes.js';
import tenantAdminRoutes from './features/tenant/tenant.routes.js';
import channelRoutes from './features/channel/channel.routes.js';
import messageRoutes from './features/message/message.routes.js';
import webhookRoutes from './features/webhook/webhook.routes.js';
import clienteRoutes from './features/cliente/cliente.routes.js';
import kbRoutes from './features/kb/kb.routes.js';
import conversationRoutes from './features/conversation/conversation.routes.js';

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);

// Healthcheck (público)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

// Rutas de Superadmin (cross-tenant, sin requireTenant)
app.use('/api/admin/tenants', tenantAdminRoutes);

// Rutas tenant-aware (fase 2+)
app.use('/api/channels/whatsapp', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/webhooks/whatsapp', webhookRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(errorHandler);

// Servidor HTTP explícito para hospedar el gateway Socket.IO (tiempo real de la bandeja).
export const server = http.createServer(app);
export const io = createSocketGateway(server);

if (env.NODE_ENV !== 'test') {
  // El puente Redis solo se conecta fuera de los tests (evita handles abiertos sin Redis).
  subscribeRealtime(io);
  mongoose
    .connect(env.MONGODB_URI)
    .then(async () => {
      logger.info('Conectado a MongoDB');
      await seedSuperadmin();
      server.listen(env.PORT, () => {
        logger.info(`Servidor escuchando en el puerto ${env.PORT}`);
      });
    })
    .catch((err: unknown) => {
      logger.error('Fallo al conectar a MongoDB', { error: String(err) });
      process.exit(1);
    });
}

export default app;

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import { csrfGuard } from './middlewares/csrf.middleware.js';
import { seedSuperadmin } from './seed/seed-superadmin.js';
import authRoutes from './features/auth/auth.routes.js';
import channelRoutes from './features/channel/channel.routes.js';
import messageRoutes from './features/message/message.routes.js';
import webhookRoutes from './features/webhook/webhook.routes.js';
import clienteRoutes from './features/cliente/cliente.routes.js';

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);

app.use('/api/auth', authRoutes);
app.use('/api/channels/whatsapp', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/webhooks/whatsapp', webhookRoutes);
app.use('/api/clientes', clienteRoutes);

app.use(errorHandler);

mongoose
  .connect(env.MONGODB_URI)
  .then(async () => {
    logger.info('Conectado a MongoDB');
    await seedSuperadmin();
    app.listen(env.PORT, () => {
      logger.info(`Servidor escuchando en el puerto ${env.PORT}`);
    });
  })
  .catch((err: unknown) => {
    logger.error('Fallo al conectar a MongoDB', { error: String(err) });
    process.exit(1);
  });

export default app;

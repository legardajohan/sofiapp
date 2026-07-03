import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import channelRoutes from './features/channel/channel.routes.js';
import messageRoutes from './features/message/message.routes.js';
import webhookRoutes from './features/webhook/webhook.routes.js';
import clienteRoutes from './features/cliente/cliente.routes.js';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/channels/whatsapp', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/webhooks/whatsapp', webhookRoutes);
app.use('/api/clientes', clienteRoutes);

app.use(errorHandler);

mongoose
  .connect(env.MONGODB_URI)
  .then(() => {
    logger.info('Conectado a MongoDB');
    app.listen(env.PORT, () => {
      logger.info(`Servidor escuchando en el puerto ${env.PORT}`);
    });
  })
  .catch((err: unknown) => {
    logger.error('Fallo al conectar a MongoDB', { error: String(err) });
    process.exit(1);
  });

export default app;

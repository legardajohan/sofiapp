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
import { seedPlans } from './seed/seed-plans.js';
import { backfillSemaforoTags } from './seed/seed-semaforo-tags.js';
import { backfillContactOptions } from './seed/seed-contact-options.js';
import { backfillEstados } from './seed/seed-estados.js';
import { seedPromptTemplates } from './seed/seed-prompt-templates.js';
import tagRoutes from './features/tag/tag.routes.js';
import leadRoutes from './features/lead/lead.routes.js';
import estadoRoutes from './features/estado/estado.routes.js';
import authRoutes from './features/auth/auth.routes.js';
import tenantAdminRoutes from './features/tenant/tenant.routes.js';
import planAdminRoutes from './features/plan/plan.routes.js';
import platformSettingsRoutes from './features/platform-settings/platform-settings.routes.js';
import exchangeRateRoutes from './features/exchange-rate/exchange-rate.routes.js';
import costCatalogRoutes from './features/cost-catalog/cost-catalog.routes.js';
import channelRoutes from './features/channel/channel.routes.js';
import messageRoutes from './features/message/message.routes.js';
import webhookRoutes from './features/webhook/webhook.routes.js';
import clienteRoutes from './features/cliente/cliente.routes.js';
import contactNoteRoutes from './features/contact-note/contact-note.routes.js';
import contactOptionRoutes from './features/contact-option/contact-option.routes.js';
import kbRoutes from './features/kb/kb.routes.js';
import kbFaqRoutes from './features/kb-faq/kb-faq.routes.js';
import conversationRoutes from './features/conversation/conversation.routes.js';
import adminProfileRoutes from './features/admin-profile/admin-profile.routes.js';
import userRoutes from './features/users/user.routes.js';
import aiRoutes from './features/ai/ai.routes.js';

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
app.use('/api/admin/plans', planAdminRoutes);
app.use('/api/admin/platform-settings', platformSettingsRoutes);
app.use('/api/admin/exchange-rate', exchangeRateRoutes);
app.use('/api/admin/cost-items', costCatalogRoutes);

// Rutas tenant-aware (fase 2+)
app.use('/api/channels/whatsapp', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/webhooks/whatsapp', webhookRoutes);
// La ruta más específica primero, igual que `/api/kb/faqs` antes de `/api/kb`.
app.use('/api/clientes/:clienteId/notas', contactNoteRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/opciones-contacto', contactOptionRoutes);
app.use('/api/kb/faqs', kbFaqRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/estados', estadoRoutes);
app.use('/api/admin-profiles', adminProfileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai/responses', aiRoutes);

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
      await seedPlans();
      await seedPromptTemplates();
      await backfillSemaforoTags();
      await backfillContactOptions();
      await backfillEstados();
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

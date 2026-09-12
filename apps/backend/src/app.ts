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
import { backfillEstadoDeclinado, backfillEstados } from './seed/seed-estados.js';
import { backfillSemaforos } from './seed/seed-semaforos.js';
import { seedPromptTemplates } from './seed/seed-prompt-templates.js';
import tagRoutes from './features/tag/tag.routes.js';
import leadRoutes from './features/lead/lead.routes.js';
import estadoRoutes from './features/estado/estado.routes.js';
import pipelineRoutes from './features/pipeline/pipeline.routes.js';
import semaforoRoutes from './features/semaforo/semaforo.routes.js';
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
import whatsappTemplateRoutes from './features/whatsapp-template/whatsapp-template.routes.js';
import conversationRoutes from './features/conversation/conversation.routes.js';
import adminProfileRoutes from './features/admin-profile/admin-profile.routes.js';
import userRoutes from './features/users/user.routes.js';
import aiRoutes from './features/ai/ai.routes.js';
import aiAssistantRoutes from './features/ai/ai-assistant.routes.js';
import aiHandoffRoutes from './features/ai/ai-handoff.routes.js';
import flowRoutes from './features/flow/flow.routes.js';

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

// ⚠️ ANTES de `express.json()`, y no abajo con el resto de rutas.
//
// Meta firma el cuerpo del webhook con HMAC-SHA256, y esa firma solo se puede validar sobre los
// BYTES EXACTOS que envió. Un parser global por delante consume el stream y deja `req.body` como
// objeto: el `express.raw` que declara `webhook.routes.ts` ya no puede hacer nada, el HMAC recibe
// un objeto y revienta. Eso es HT-WA-02, y tuvo al inbound de WhatsApp caído por completo.
//
// No mover nada por encima de esta línea. `csrfGuard` ya exime `/api/webhooks/` y el webhook no
// usa cookies, así que no pierde nada por ir delante de ellos.
// Lo que sostiene esta regla no es este comentario: es `webhook.routes.test.ts`, que falla en el
// acto si el orden se rompe.
app.use('/api/webhooks/whatsapp', webhookRoutes);

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
app.use('/api/templates', whatsappTemplateRoutes);
// `/api/webhooks/whatsapp` NO va aquí: necesita el cuerpo crudo y se monta arriba, antes de
// `express.json()`.
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
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/semaforos', semaforoRoutes);
app.use('/api/admin-profiles', adminProfileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai/responses', aiRoutes);
app.use('/api/ai/handoff-rules', aiHandoffRoutes);
// Va DESPUÉS de `/api/ai/responses` y `/api/ai/handoff-rules`: el prefijo más específico tiene que
// resolverse primero, o el genérico se los come.
app.use('/api/ai', aiAssistantRoutes);
app.use('/api/flows', flowRoutes);

app.use(errorHandler);

// Servidor HTTP explícito para hospedar el gateway Socket.IO (tiempo real de la bandeja).
export const server = http.createServer(app);
export const io = createSocketGateway(server);

if (env.NODE_ENV !== 'test') {
  // `META_APP_SECRET` es opcional a propósito —hay despliegues sin WhatsApp— pero sin ella
  // `validateHmacSignature` devuelve `false` de entrada y TODO webhook entrante recibe un 403.
  // El síntoma es idéntico al de HT-WA-02 (no llega nada a la bandeja) y la causa es otra, así que
  // se avisa alto en vez de dejar que se descubra depurando.
  if (!env.META_APP_SECRET) {
    logger.warn(
      'META_APP_SECRET sin configurar: el webhook de WhatsApp rechazará (403) todo evento ' +
        'entrante y el inbound no funcionará. Configúrala con el App Secret de la app de Meta.',
    );
  }

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
      await backfillEstadoDeclinado();
      await backfillSemaforos();
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

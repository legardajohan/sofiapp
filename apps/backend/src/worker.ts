import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { AI_REPLY_QUEUE_NAME, KB_INDEX_QUEUE_NAME } from './config/queues.js';
import { inboundMessageProcessor } from './workers/inbound-message.processor.js';
import { processKbIndexJob } from './workers/kb-index.processor.js';
import { processAiReplyJob, type AiReplyJobData } from './workers/ai-reply.processor.js';
import { GeminiProvider } from './integrations/llm/gemini.provider.js';
import type { KbIndexJobData } from './features/kb/kb.types.js';

const redisConnection = { url: env.REDIS_URL };

// TEMP DEBUG — eliminar después de verificar
{
  const k = env.GEMINI_API_KEY;
  const masked = k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-4)} (len=${k.length})` : `"${k}" (len=${k.length})`;
  logger.info('TEMP DEBUG GEMINI_API_KEY', {
    masked,
    isPlaceholder: k === 'invalid-key-123',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });
}

// Placeholder workers — se implementan en M04, M01-02 y M07
const llmWorker = new Worker(
  'llm-process',
  async (job) => {
    logger.info('llm-process job recibido', { id: job.id, name: job.name });
  },
  { connection: redisConnection },
);

const outboundWorker = new Worker(
  'outbound-send',
  async (job) => {
    logger.info('outbound-send job recibido', { id: job.id, name: job.name });
  },
  { connection: redisConnection },
);

const campaignWorker = new Worker(
  'campaign-broadcast',
  async (job) => {
    logger.info('campaign-broadcast job recibido', { id: job.id, name: job.name });
  },
  { connection: redisConnection },
);

// KB / RAG — indexación de conocimiento (HU-KB-01)
const kbIndexWorker = new Worker<KbIndexJobData>(
  KB_INDEX_QUEUE_NAME,
  async (job) => {
    await processKbIndexJob(job.data, new GeminiProvider());
  },
  { connection: redisConnection },
);

// Chatbot IA — auto-reply con RAG sobre la KB (HU-IA-01)
const aiReplyWorker = new Worker<AiReplyJobData>(
  AI_REPLY_QUEUE_NAME,
  async (job) => {
    await processAiReplyJob(job.data);
  },
  { connection: redisConnection },
);

for (const w of [llmWorker, outboundWorker, campaignWorker, kbIndexWorker, aiReplyWorker]) {
  w.on('failed', (job, err) => {
    logger.error(`Worker ${w.name} job falló`, { jobId: job?.id, error: String(err) });
  });
}

mongoose
  .connect(env.MONGODB_URI)
  .then(() => {
    logger.info('Worker conectado a MongoDB');

    inboundMessageProcessor.on('completed', (job) => {
      logger.info('Job completado', { jobId: job.id, queue: job.queueName });
    });

    inboundMessageProcessor.on('failed', (job, err) => {
      logger.error('Job fallido', { jobId: job?.id, queue: job?.queueName, error: String(err) });
    });

    logger.info('Proceso WORKER iniciado y escuchando colas BullMQ');
  })
  .catch((err: unknown) => {
    logger.error('Worker: fallo al conectar a MongoDB', { error: String(err) });
    process.exit(1);
  });

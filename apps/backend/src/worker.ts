import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { AI_REPLY_QUEUE_NAME, INBOUND_QUEUE_NAME, KB_INDEX_QUEUE_NAME } from './config/queues.js';
import { processInboundJob, type InboundJobData } from './workers/inbound-message.processor.js';
import { processKbIndexJob } from './workers/kb-index.processor.js';
import { processAiReplyJob, type AiReplyJobData } from './workers/ai-reply.processor.js';
import { GeminiProvider } from './integrations/llm/gemini.provider.js';
import type { KbIndexJobData } from './features/kb/kb.types.js';

const redisConnection = { url: env.REDIS_URL };

// Ingesta de entrantes de WhatsApp (HT-WA-01) y decisión de auto-responder (HU-IA-02)
const inboundWorker = new Worker<InboundJobData>(
  INBOUND_QUEUE_NAME,
  async (job) => {
    await processInboundJob(job.data);
  },
  { connection: redisConnection },
);

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

for (const w of [inboundWorker, llmWorker, outboundWorker, campaignWorker, kbIndexWorker, aiReplyWorker]) {
  w.on('failed', (job, err) => {
    logger.error(`Worker ${w.name} job falló`, { jobId: job?.id, error: String(err) });
  });
}

mongoose
  .connect(env.MONGODB_URI)
  .then(() => {
    logger.info('Worker conectado a MongoDB');
    logger.info('Proceso WORKER iniciado y escuchando colas BullMQ');
  })
  .catch((err: unknown) => {
    logger.error('Worker: fallo al conectar a MongoDB', { error: String(err) });
    process.exit(1);
  });

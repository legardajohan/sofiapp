import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import {
  KB_INDEX_QUEUE_NAME,
  FLOW_RUNTIME_QUEUE_NAME,
  REMINDER_SWEEP_JOB,
  REMINDER_SWEEP_SCHEDULER_ID,
  flowRuntimeQueue,
} from './config/queues.js';
import { inboundMessageProcessor } from './workers/inbound-message.processor.js';
import { processKbIndexJob } from './workers/kb-index.processor.js';
import { processFlowRuntimeJob } from './workers/flow-runtime.processor.js';
import { GeminiProvider } from './integrations/llm/gemini.provider.js';
import type { KbIndexJobData } from './features/kb/kb.types.js';
import type { FlowJobData } from './features/flow/flow.types.js';

const redisConnection = { url: env.REDIS_URL };

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

// Eje del tiempo del motor de flujos (HU-FLOW-02): nodos `espera` y recordatorios de inactividad.
// `concurrency` explícita porque el envío pega contra la Graph API y no conviene ráfagas.
const flowRuntimeWorker = new Worker<FlowJobData | Record<string, never>>(
  FLOW_RUNTIME_QUEUE_NAME,
  processFlowRuntimeJob,
  { connection: redisConnection, concurrency: 5 },
);

for (const w of [llmWorker, outboundWorker, campaignWorker, kbIndexWorker, flowRuntimeWorker]) {
  w.on('failed', (job, err) => {
    logger.error(`Worker ${w.name} job falló`, { jobId: job?.id, error: String(err) });
  });
}

mongoose
  .connect(env.MONGODB_URI)
  .then(async () => {
    logger.info('Worker conectado a MongoDB');

    inboundMessageProcessor.on('completed', (job) => {
      logger.info('Job completado', { jobId: job.id, queue: job.queueName });
    });

    inboundMessageProcessor.on('failed', (job, err) => {
      logger.error('Job fallido', { jobId: job?.id, queue: job?.queueName, error: String(err) });
    });

    // Barrido periódico de recordatorios (HU-FLOW-02): Job Scheduler idempotente por
    // `schedulerId` — reiniciar el proceso no duplica la programación.
    await flowRuntimeQueue.upsertJobScheduler(
      REMINDER_SWEEP_SCHEDULER_ID,
      { every: env.REMINDER_SWEEP_INTERVAL_MS },
      { name: REMINDER_SWEEP_JOB, opts: { removeOnComplete: 100 } },
    );

    logger.info('Proceso WORKER iniciado y escuchando colas BullMQ');
  })
  .catch((err: unknown) => {
    logger.error('Worker: fallo al conectar a MongoDB', { error: String(err) });
    process.exit(1);
  });

import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const redisConnection = { host: env.REDIS_HOST, port: env.REDIS_PORT };

// Placeholder workers — se implementan en M04, M01-02 y M07
const llmWorker = new Worker('llm-process', async (job) => {
  logger.info('llm-process job recibido', { id: job.id, name: job.name });
}, { connection: redisConnection });

const outboundWorker = new Worker('outbound-send', async (job) => {
  logger.info('outbound-send job recibido', { id: job.id, name: job.name });
}, { connection: redisConnection });

const campaignWorker = new Worker('campaign-broadcast', async (job) => {
  logger.info('campaign-broadcast job recibido', { id: job.id, name: job.name });
}, { connection: redisConnection });

for (const w of [llmWorker, outboundWorker, campaignWorker]) {
  w.on('failed', (job, err) => {
    logger.error(`Worker ${w.name} job falló`, { jobId: job?.id, err });
  });
}

logger.info('Proceso WORKER iniciado y escuchando colas BullMQ');

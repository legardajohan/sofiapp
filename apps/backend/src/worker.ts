import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { connectDB } from './db.js';
import { logger } from './utils/logger.js';

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };

// Procesadores BullMQ (placeholders — se implementan en sus features)
const _llmWorker = new Worker('llm-process', async (job) => {
  logger.info('llm-process job', { id: job.id });
}, { connection });

const _outboundWorker = new Worker('outbound-send', async (job) => {
  logger.info('outbound-send job', { id: job.id });
}, { connection });

const _campaignWorker = new Worker('campaign-broadcast', async (job) => {
  logger.info('campaign-broadcast job', { id: job.id });
}, { connection });

const start = async (): Promise<void> => {
  await connectDB();
  logger.info('Worker BullMQ iniciado');
};

start().catch((err) => {
  logger.error('Error al iniciar el worker', { err });
  process.exit(1);
});

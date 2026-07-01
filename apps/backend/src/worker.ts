import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { inboundMessageProcessor } from './workers/inbound-message.processor.js';

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

    logger.info('Worker inbound-messages iniciado');
  })
  .catch((err: unknown) => {
    logger.error('Worker: fallo al conectar a MongoDB', { error: String(err) });
    process.exit(1);
  });

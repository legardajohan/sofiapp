import { Queue } from 'bullmq';
import { env } from './env.js';

export const INBOUND_QUEUE_NAME = 'inbound-messages';

const connection = { url: env.REDIS_URL };

export const inboundQueue = new Queue(INBOUND_QUEUE_NAME, { connection });

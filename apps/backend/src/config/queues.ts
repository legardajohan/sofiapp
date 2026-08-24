import { Queue } from 'bullmq';
import { env } from './env.js';

export const INBOUND_QUEUE_NAME = 'inbound-messages';
export const KB_INDEX_QUEUE_NAME = 'kb-index';
export const KB_INDEX_JOB_NAME = 'index-document';
export const AI_REPLY_QUEUE_NAME = 'ai-reply';
export const AI_REPLY_JOB_NAME = 'auto-reply';

const connection = { url: env.REDIS_URL };

export const inboundQueue = new Queue(INBOUND_QUEUE_NAME, { connection });
export const kbIndexQueue = new Queue(KB_INDEX_QUEUE_NAME, { connection });
export const aiReplyQueue = new Queue(AI_REPLY_QUEUE_NAME, { connection });

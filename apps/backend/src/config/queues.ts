import { Queue } from 'bullmq';
import { env } from './env.js';

export const INBOUND_QUEUE_NAME = 'inbound-messages';
export const KB_INDEX_QUEUE_NAME = 'kb-index';
export const KB_INDEX_JOB_NAME = 'index-document';

// HU-FLOW-02 — eje del tiempo del motor de flujos: reanudación de nodos `espera` y recordatorios
// de inactividad antes de que expire la ventana de 24 h.
export const FLOW_RUNTIME_QUEUE_NAME = 'flow-runtime';
export const FLOW_RESUME_JOB = 'resume';
export const FLOW_REMINDER_JOB = 'reminder';
export const REMINDER_SWEEP_JOB = 'sweep';
export const REMINDER_SWEEP_SCHEDULER_ID = 'reminder-sweep';

const connection = { url: env.REDIS_URL };

export const inboundQueue = new Queue(INBOUND_QUEUE_NAME, { connection });
export const kbIndexQueue = new Queue(KB_INDEX_QUEUE_NAME, { connection });
export const flowRuntimeQueue = new Queue(FLOW_RUNTIME_QUEUE_NAME, { connection });

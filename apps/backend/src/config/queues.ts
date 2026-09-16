import { Queue } from 'bullmq';
import { env } from './env.js';

export const INBOUND_QUEUE_NAME = 'inbound-messages';
export const KB_INDEX_QUEUE_NAME = 'kb-index';
export const KB_INDEX_JOB_NAME = 'index-document';
export const AI_REPLY_QUEUE_NAME = 'ai-reply';
export const AI_REPLY_JOB_NAME = 'auto-reply';

// HU-FLOW-02 — eje del tiempo del motor de flujos: reanudación de nodos `espera` y recordatorios
// de inactividad antes de que expire la ventana de 24 h.
export const FLOW_RUNTIME_QUEUE_NAME = 'flow-runtime';
export const FLOW_RESUME_JOB = 'resume';
export const FLOW_REMINDER_JOB = 'reminder';
export const REMINDER_SWEEP_JOB = 'sweep';
export const REMINDER_SWEEP_SCHEDULER_ID = 'reminder-sweep';

// HU-MARK-01 — difusión de campañas. El nombre de la cola es el que `apps/backend/CLAUDE.md` y
// `docs/architecture.md` ya tenían reservado, y el que ocupaba el worker placeholder de `worker.ts`.
export const CAMPAIGN_QUEUE_NAME = 'campaign-broadcast';
/** Un lote de destinatarios. El job se re-encola a sí mismo hasta agotar la campaña. */
export const CAMPAIGN_BATCH_JOB = 'batch';
/** Barrido de campañas `programada` cuya hora ya llegó. */
export const CAMPAIGN_START_JOB = 'start-scheduled';
export const CAMPAIGN_SWEEP_SCHEDULER_ID = 'campaign-sweep';

const connection = { url: env.REDIS_URL };

export const inboundQueue = new Queue(INBOUND_QUEUE_NAME, { connection });
export const kbIndexQueue = new Queue(KB_INDEX_QUEUE_NAME, { connection });
export const aiReplyQueue = new Queue(AI_REPLY_QUEUE_NAME, { connection });
export const flowRuntimeQueue = new Queue(FLOW_RUNTIME_QUEUE_NAME, { connection });
export const campaignQueue = new Queue(CAMPAIGN_QUEUE_NAME, { connection });

import type { Job } from 'bullmq';
import { FLOW_RESUME_JOB, FLOW_REMINDER_JOB, REMINDER_SWEEP_JOB } from '../config/queues.js';
import { logger } from '../utils/logger.js';
import { reanudarFlujo } from '../features/flow/flow.runtime.service.js';
import { enviarRecordatorio, ejecutarBarridoRecordatorios } from '../features/flow/flow.reminder.service.js';
import type { FlowJobData } from '../features/flow/flow.types.js';

/**
 * Dispatcher de la cola `flow-runtime` (HU-FLOW-02): tres nombres de job comparten la misma cola
 * porque los tres reaccionan al paso del tiempo, no a un mensaje entrante. `sweep` es el único que
 * no lleva `job.data` con forma de `FlowJobData` — lo produce el Job Scheduler de BullMQ, sin
 * payload propio.
 */
export async function processFlowRuntimeJob(job: Job<FlowJobData | Record<string, never>>): Promise<void> {
  switch (job.name) {
    case FLOW_RESUME_JOB: {
      const data = job.data as Extract<FlowJobData, { tipo: 'resume' }>;
      await reanudarFlujo(data.tenantId, data.clienteId, data.token);
      return;
    }
    case FLOW_REMINDER_JOB: {
      const data = job.data as Extract<FlowJobData, { tipo: 'reminder' }>;
      await enviarRecordatorio(data.tenantId, data.clienteId);
      return;
    }
    case REMINDER_SWEEP_JOB:
      await ejecutarBarridoRecordatorios(new Date());
      return;
    default:
      logger.warn('flow-runtime: job con nombre desconocido', { name: job.name, id: job.id });
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

const { reanudarFlujoMock, enviarRecordatorioMock, ejecutarBarridoMock } = vi.hoisted(() => ({
  reanudarFlujoMock: vi.fn().mockResolvedValue(undefined),
  enviarRecordatorioMock: vi.fn().mockResolvedValue(undefined),
  ejecutarBarridoMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../features/flow/flow.runtime.service.js', () => ({ reanudarFlujo: reanudarFlujoMock }));
vi.mock('../features/flow/flow.reminder.service.js', () => ({
  enviarRecordatorio: enviarRecordatorioMock,
  ejecutarBarridoRecordatorios: ejecutarBarridoMock,
}));

import { processFlowRuntimeJob } from './flow-runtime.processor.js';

function fakeJob(name: string, data: unknown): Job {
  return { id: '1', name, data } as unknown as Job;
}

beforeEach(() => {
  reanudarFlujoMock.mockClear();
  enviarRecordatorioMock.mockClear();
  ejecutarBarridoMock.mockClear();
});

describe('processFlowRuntimeJob — dispatcher de la cola flow-runtime (HU-FLOW-02)', () => {
  it('job "resume" → reanudarFlujo con tenantId, clienteId y token', async () => {
    const data = { tipo: 'resume', tenantId: 't1', clienteId: 'c1', token: 'tok1' };
    await processFlowRuntimeJob(fakeJob('resume', data));
    expect(reanudarFlujoMock).toHaveBeenCalledWith('t1', 'c1', 'tok1');
    expect(enviarRecordatorioMock).not.toHaveBeenCalled();
    expect(ejecutarBarridoMock).not.toHaveBeenCalled();
  });

  it('job "reminder" → enviarRecordatorio con tenantId y clienteId', async () => {
    const data = { tipo: 'reminder', tenantId: 't1', clienteId: 'c1' };
    await processFlowRuntimeJob(fakeJob('reminder', data));
    expect(enviarRecordatorioMock).toHaveBeenCalledWith('t1', 'c1');
    expect(reanudarFlujoMock).not.toHaveBeenCalled();
  });

  it('job "sweep" → ejecutarBarridoRecordatorios, sin depender de job.data', async () => {
    await processFlowRuntimeJob(fakeJob('sweep', {}));
    expect(ejecutarBarridoMock).toHaveBeenCalledTimes(1);
    expect(ejecutarBarridoMock.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });

  it('un nombre de job desconocido no lanza ni llama a ningún handler', async () => {
    await expect(processFlowRuntimeJob(fakeJob('nombre-desconocido', {}))).resolves.toBeUndefined();
    expect(reanudarFlujoMock).not.toHaveBeenCalled();
    expect(enviarRecordatorioMock).not.toHaveBeenCalled();
    expect(ejecutarBarridoMock).not.toHaveBeenCalled();
  });
});

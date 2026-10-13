import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../repositories/base.repository.js';
import { WhatsAppTemplate } from '../features/whatsapp-template/whatsapp-template.model.js';

/** HT-WA-04 — barrido de respaldo del estado de plantillas (criterio 6). */
const { mockAdd } = vi.hoisted(() => ({ mockAdd: vi.fn() }));
vi.mock('../config/queues.js', async (original) => {
  const real = await original<typeof import('../config/queues.js')>();
  return { ...real, templateQueue: { add: mockAdd } };
});

import { processTemplateSyncSweep } from './template.processor.js';

async function plantilla(tenantId: Types.ObjectId, name: string, status: string): Promise<void> {
  await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: `meta-${name}`,
    name,
    language: 'es',
    category: 'UTILITY',
    status,
    components: [{ type: 'BODY', text: 'Hola' }],
    parametrosBody: 0,
  });
}

beforeEach(() => {
  mockAdd.mockReset().mockResolvedValue(undefined);
});

describe('processTemplateSyncSweep', () => {
  it('encola un job por tenant con plantillas en revisión, y ninguno para los demás', async () => {
    const enRevision = new Types.ObjectId();
    const enApelacion = new Types.ObjectId();
    const todoAprobado = new Types.ObjectId();
    await plantilla(enRevision, 'a', 'PENDING');
    await plantilla(enRevision, 'b', 'PENDING');
    await plantilla(enApelacion, 'c', 'IN_APPEAL');
    await plantilla(todoAprobado, 'd', 'APPROVED');

    const total = await processTemplateSyncSweep();

    expect(total).toBe(2);
    const tenants = mockAdd.mock.calls.map((c) => (c[1] as { tenantId: string }).tenantId).sort();
    expect(tenants).toEqual([enApelacion.toString(), enRevision.toString()].sort());
    expect(mockAdd.mock.calls[0]![2]).toMatchObject({ jobId: expect.stringMatching(/^template-sync-/) });
  });
});

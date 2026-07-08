import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

// Mock de la cola BullMQ: evita conexión a Redis en los tests.
const { mockAdd } = vi.hoisted(() => ({ mockAdd: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: mockAdd },
}));

import { createDocument, listDocuments } from './kb.service.js';
import { KbDocument } from './kb-document.model.js';
import { findScoped } from '../../repositories/base.repository.js';
import type { IKbDocument } from './kb.types.js';

// Mongo en memoria provisto por tests/globalSetup.ts + tests/setup.ts.

describe('createDocument', () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  it('persiste con el tenantId del argumento y encola el job kb-index', async () => {
    const tenantId = new Types.ObjectId();
    const res = await createDocument(tenantId, { titulo: 'Guía', contenido: 'Contenido de prueba' });

    expect(res.estadoIndexacion).toBe('pendiente');
    expect(res.version).toBe(1);

    const saved = await KbDocument.findById(res.id).lean<IKbDocument>();
    expect(saved?.tenantId.toString()).toBe(tenantId.toString());

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith('index-document', {
      tenantId: tenantId.toString(),
      documentId: res.id,
      version: 1,
    });
  });

  it('re-subir el mismo título incrementa la versión y reinicia el estado', async () => {
    const tenantId = new Types.ObjectId();
    const first = await createDocument(tenantId, { titulo: 'Manual', contenido: 'v1' });
    const second = await createDocument(tenantId, { titulo: 'Manual', contenido: 'v2 más contenido' });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.id).toBe(first.id); // misma entidad
    expect(second.estadoIndexacion).toBe('pendiente');

    const total = await KbDocument.countDocuments({ tenantId });
    expect(total).toBe(1);
  });
});

describe('listDocuments — aislamiento multi-tenant', () => {
  it('tenantB no ve documentos creados para tenantA', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();

    await createDocument(tenantA, { titulo: 'Doc A', contenido: 'contenido A' });

    const listB = await listDocuments(tenantB, 1, 20);
    expect(listB.total).toBe(0);
    expect(listB.data).toHaveLength(0);

    const listA = await listDocuments(tenantA, 1, 20);
    expect(listA.total).toBe(1);
    expect(listA.data[0]?.titulo).toBe('Doc A');
  });

  it('findScoped confirma que el documento no es accesible desde otro tenant', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await createDocument(tenantA, { titulo: 'Privado', contenido: 'secreto' });

    const docsB = await findScoped(KbDocument, tenantB).exec();
    expect(docsB).toHaveLength(0);
  });
});

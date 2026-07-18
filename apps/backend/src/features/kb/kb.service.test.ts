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

import {
  createDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
  seedPresetDocuments,
} from './kb.service.js';
import { KbDocument } from './kb-document.model.js';
import { KbChunk } from './kb-chunk.model.js';
import { createScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
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

describe('updateDocument', () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  it('re-versiona, limpia chunks viejos y encola el job cuando hay contenido', async () => {
    const tenantId = new Types.ObjectId();
    const created = await createDocument(tenantId, { titulo: 'Editable', contenido: 'v1' });
    await createScoped(KbChunk, tenantId, {
      documentId: created.id,
      version: 1,
      chunkIndex: 0,
      texto: 'fragmento viejo',
      embedding: [0.1],
    });
    mockAdd.mockClear();

    const updated = await updateDocument(tenantId, created.id, 'contenido corregido');

    expect(updated.id).toBe(created.id);
    expect(updated.version).toBe(2);
    expect(updated.estadoIndexacion).toBe('pendiente');
    expect(updated.chunkCount).toBe(0);
    expect(updated.contenido).toBe('contenido corregido');

    const chunks = await findScoped(KbChunk, tenantId, { documentId: created.id }).exec();
    expect(chunks).toHaveLength(0);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith('index-document', {
      tenantId: tenantId.toString(),
      documentId: created.id,
      version: 2,
    });
  });

  it('contenido vacío no encola el job y deja el documento en pendiente', async () => {
    const tenantId = new Types.ObjectId();
    const created = await createDocument(tenantId, { titulo: 'A vaciar', contenido: 'algo' });
    mockAdd.mockClear();

    const updated = await updateDocument(tenantId, created.id, '   ');

    expect(updated.estadoIndexacion).toBe('pendiente');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('documento inexistente → AppError 404', async () => {
    const tenantId = new Types.ObjectId();
    await expect(
      updateDocument(tenantId, new Types.ObjectId().toString(), 'texto'),
    ).rejects.toThrow(AppError);
  });

  it('aislamiento multi-tenant: tenantB no puede editar un documento de tenantA', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const created = await createDocument(tenantA, { titulo: 'Solo A', contenido: 'v1' });
    mockAdd.mockClear();

    await expect(updateDocument(tenantB, created.id, 'hackeado')).rejects.toThrow(AppError);
    expect(mockAdd).not.toHaveBeenCalled();

    const doc = await KbDocument.findById(created.id).lean<IKbDocument>();
    expect(doc?.contenido).toBe('v1');
    expect(doc?.version).toBe(1);
  });
});

describe('seedPresetDocuments', () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  it('inserta 5 presets vacíos con isPreset=true y sin encolar jobs', async () => {
    const tenantId = new Types.ObjectId();

    await seedPresetDocuments(tenantId);

    const docs = await findScoped(KbDocument, tenantId)
      .lean<(IKbDocument & { _id: Types.ObjectId })[]>()
      .exec();
    expect(docs).toHaveLength(5);
    for (const doc of docs) {
      expect(doc.isPreset).toBe(true);
      expect(doc.contenido).toBe('');
      expect(doc.estadoIndexacion).toBe('pendiente');
      expect(doc.version).toBe(1);
      expect(doc.proposito).toBeTruthy();
    }
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('aislamiento multi-tenant: los presets de tenantA no son visibles para tenantB', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();

    await seedPresetDocuments(tenantA);

    const listB = await listDocuments(tenantB, 1, 20);
    expect(listB.total).toBe(0);
  });
});

describe('deleteDocument', () => {
  it('borra el documento y sus chunks asociados', async () => {
    const tenantId = new Types.ObjectId();
    const created = await createDocument(tenantId, { titulo: 'A borrar', contenido: 'x' });
    await createScoped(KbChunk, tenantId, {
      documentId: created.id,
      version: 1,
      chunkIndex: 0,
      texto: 'fragmento',
      embedding: [0.1],
    });

    const result = await deleteDocument(tenantId, created.id);
    expect(result).toEqual({ deleted: true });

    const doc = await KbDocument.findById(created.id);
    expect(doc).toBeNull();

    const chunks = await findScoped(KbChunk, tenantId, { documentId: created.id }).exec();
    expect(chunks).toHaveLength(0);
  });

  it('documento inexistente → AppError 404', async () => {
    const tenantId = new Types.ObjectId();
    await expect(deleteDocument(tenantId, new Types.ObjectId().toString())).rejects.toThrow(
      AppError,
    );
  });

  it('aislamiento multi-tenant: tenantB no puede borrar un documento de tenantA', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const created = await createDocument(tenantA, { titulo: 'Solo A', contenido: 'x' });

    await expect(deleteDocument(tenantB, created.id)).rejects.toThrow(AppError);

    const doc = await KbDocument.findById(created.id);
    expect(doc).not.toBeNull();
  });
});

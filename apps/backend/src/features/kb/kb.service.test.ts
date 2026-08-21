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
import { Tenant } from '../tenant/tenant.model.js';
import { createScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import type { IKbDocument, KbEstructura } from './kb.types.js';

// Los tests de arriba usan `new Types.ObjectId()` sin `Tenant` real (el bump de kbVersion hace
// un `updateOne` que simplemente no matchea nada, sin lanzar). Los de kbVersion sí necesitan un
// `Tenant` real para leer el contador después.
async function createTenant(): Promise<Types.ObjectId> {
  const tenant = await Tenant.create({
    nombre: 'Tenant KB-03',
    slug: `kb03-${new Types.ObjectId().toString()}`,
    contacto: { email: 'kb03@example.com', telefono: '3000000000' },
  });
  return tenant._id;
}

async function readKbVersion(tenantId: Types.ObjectId): Promise<number | undefined> {
  const tenant = await Tenant.findById(tenantId).lean<{ kbVersion?: number }>();
  return tenant?.kbVersion;
}

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

  it('re-subir el mismo título con contenido idéntico no re-versiona ni encola (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const first = await createDocument(tenantId, { titulo: 'Manual', contenido: 'texto estable' });
    mockAdd.mockClear();

    const second = await createDocument(tenantId, { titulo: 'Manual', contenido: 'texto estable' });

    expect(second.version).toBe(first.version);
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('re-subir el título de un preset oculto lo resucita sobre el mismo documento (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Horarios y ubicación',
      contenido: 'horario viejo',
      isPreset: true,
      obligatorio: false,
      oculto: true,
      version: 2,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    const revivido = await createDocument(tenantId, {
      titulo: 'Horarios y ubicación',
      contenido: 'horario nuevo',
    });

    expect(revivido.id).toBe(preset._id.toString());
    expect(revivido.oculto).toBe(false);
    expect(await KbDocument.countDocuments({ tenantId })).toBe(1);
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

    const updated = await updateDocument(tenantId, created.id, { contenido: 'contenido corregido' });

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

  it('primer llenado de un preset vacío mantiene la versión en 1, limpia chunks y encola el job', async () => {
    const tenantId = new Types.ObjectId();
    // Preset seedeado: nace vacío en version 1 (como lo deja seedPresetDocuments).
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Información de la empresa',
      proposito: 'Nombre, misión, visión',
      contenido: '',
      isPreset: true,
      obligatorio: true,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });
    // Chunk residual: no debería sobrevivir al re-indexado aunque el preset naciera vacío.
    await createScoped(KbChunk, tenantId, {
      documentId: preset._id,
      version: 1,
      chunkIndex: 0,
      texto: 'fragmento residual',
      embedding: [0.1],
    });
    mockAdd.mockClear();

    const updated = await updateDocument(
      tenantId,
      preset._id.toString(),
      { contenido: 'Contenido real del preset' },
    );

    // Primer llenado (contenido previo vacío) NO incrementa la versión.
    expect(updated.version).toBe(1);
    expect(updated.estadoIndexacion).toBe('pendiente');
    expect(updated.chunkCount).toBe(0);
    expect(updated.contenido).toBe('Contenido real del preset');

    const chunks = await findScoped(KbChunk, tenantId, { documentId: preset._id }).exec();
    expect(chunks).toHaveLength(0);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith('index-document', {
      tenantId: tenantId.toString(),
      documentId: preset._id.toString(),
      version: 1,
    });
  });

  it('secuencia de versiones: preset vacío → primer llenado (v1) → segunda edición (v2)', async () => {
    const tenantId = new Types.ObjectId();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Productos y servicios',
      contenido: '',
      isPreset: true,
      obligatorio: true,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    const firstFill = await updateDocument(tenantId, preset._id.toString(), { contenido: 'Catálogo inicial' });
    expect(firstFill.version).toBe(1); // primer llenado

    const secondEdit = await updateDocument(tenantId, preset._id.toString(), { contenido: 'Catálogo corregido' });
    expect(secondEdit.version).toBe(2); // ya tenía contenido real → sí incrementa
  });

  it('contenido vacío no encola el job y deja el documento en pendiente', async () => {
    const tenantId = new Types.ObjectId();
    const created = await createDocument(tenantId, { titulo: 'A vaciar', contenido: 'algo' });
    mockAdd.mockClear();

    const updated = await updateDocument(tenantId, created.id, { contenido: '   ' });

    expect(updated.estadoIndexacion).toBe('pendiente');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('documento inexistente → AppError 404', async () => {
    const tenantId = new Types.ObjectId();
    await expect(
      updateDocument(tenantId, new Types.ObjectId().toString(), { contenido: 'texto' }),
    ).rejects.toThrow(AppError);
  });

  it('guardar contenido idéntico es un no-op total (HU-KB-06)', async () => {
    const tenantId = await createTenant();
    const created = await createDocument(tenantId, { titulo: 'Estable', contenido: 'texto estable' });
    await createScoped(KbChunk, tenantId, {
      documentId: created.id,
      version: 1,
      chunkIndex: 0,
      texto: 'fragmento vigente',
      embedding: [0.1],
    });
    const kbVersionAntes = await readKbVersion(tenantId);
    mockAdd.mockClear();

    const updated = await updateDocument(tenantId, created.id, { contenido: 'texto estable' });

    expect(updated.version).toBe(created.version);
    expect(updated.updatedAt).toBe(created.updatedAt); // la fecha NO se toca
    expect(updated.chunkCount).toBe(created.chunkCount);
    expect(mockAdd).not.toHaveBeenCalled();
    expect(await readKbVersion(tenantId)).toBe(kbVersionAntes);

    // Los chunks vigentes sobreviven: no había nada que re-indexar.
    const chunks = await findScoped(KbChunk, tenantId, { documentId: created.id }).exec();
    expect(chunks).toHaveLength(1);
  });

  it('cambios que son solo whitespace se tratan como sin cambios (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const created = await createDocument(tenantId, { titulo: 'Whitespace', contenido: 'hola mundo' });
    mockAdd.mockClear();

    const updated = await updateDocument(tenantId, created.id, { contenido: '  hola\n\n   mundo  ' });

    expect(updated.version).toBe(created.version);
    expect(updated.contenido).toBe('hola mundo'); // conserva el texto original, no el reformateado
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('cambiar solo la capitalización SÍ re-versiona: la normalización no baja a minúsculas (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const created = await createDocument(tenantId, { titulo: 'Ciudad', contenido: 'Bogotá' });
    mockAdd.mockClear();

    const updated = await updateDocument(tenantId, created.id, { contenido: 'bogotá' });

    expect(updated.version).toBe(2);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('aislamiento multi-tenant: tenantB no puede editar un documento de tenantA', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const created = await createDocument(tenantA, { titulo: 'Solo A', contenido: 'v1' });
    mockAdd.mockClear();

    await expect(updateDocument(tenantB, created.id, { contenido: 'hackeado' })).rejects.toThrow(AppError);
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

describe('deleteDocument — obligatorios y soft-delete de presets (HU-KB-06)', () => {
  it('rechaza con 400 el borrado de un documento obligatorio, sin tocar nada', async () => {
    const tenantId = new Types.ObjectId();
    const obligatorio = await createScoped(KbDocument, tenantId, {
      titulo: 'Información de la empresa',
      contenido: 'misión y visión',
      isPreset: true,
      obligatorio: true,
      version: 1,
      estadoIndexacion: 'indexado',
      chunkCount: 1,
    });
    await createScoped(KbChunk, tenantId, {
      documentId: obligatorio._id,
      version: 1,
      chunkIndex: 0,
      texto: 'fragmento',
      embedding: [0.1],
    });

    await expect(deleteDocument(tenantId, obligatorio._id.toString())).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await KbDocument.findById(obligatorio._id)).not.toBeNull();
    const chunks = await findScoped(KbChunk, tenantId, { documentId: obligatorio._id }).exec();
    expect(chunks).toHaveLength(1);
  });

  it('un preset no obligatorio se oculta en vez de borrarse, y pierde sus chunks', async () => {
    const tenantId = new Types.ObjectId();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Políticas y términos',
      contenido: 'devoluciones a 30 días',
      isPreset: true,
      obligatorio: false,
      version: 2,
      estadoIndexacion: 'indexado',
      chunkCount: 1,
    });
    await createScoped(KbChunk, tenantId, {
      documentId: preset._id,
      version: 2,
      chunkIndex: 0,
      texto: 'fragmento',
      embedding: [0.1],
    });

    await deleteDocument(tenantId, preset._id.toString());

    const saved = await KbDocument.findById(preset._id).lean<IKbDocument>();
    expect(saved).not.toBeNull();
    expect(saved?.oculto).toBe(true);
    expect(saved?.contenido).toBe('');
    expect(saved?.chunkCount).toBe(0);
    expect(saved?.estadoIndexacion).toBe('pendiente');

    const chunks = await findScoped(KbChunk, tenantId, { documentId: preset._id }).exec();
    expect(chunks).toHaveLength(0);
  });

  it('un preset re-creado por POST (isPreset:false) también se oculta: la identidad es el título', async () => {
    const tenantId = new Types.ObjectId();
    // createDocument no puede marcar isPreset — el borde HTTP solo acepta titulo y contenido.
    const recreado = await createDocument(tenantId, {
      titulo: 'Horarios y ubicación',
      contenido: 'L-V 8am a 5pm',
    });
    const antes = await KbDocument.findById(recreado.id).lean<IKbDocument>();
    expect(antes?.isPreset).toBe(false); // se documenta el punto de partida del caso

    await deleteDocument(tenantId, recreado.id);

    const saved = await KbDocument.findById(recreado.id).lean<IKbDocument>();
    expect(saved).not.toBeNull();
    expect(saved?.oculto).toBe(true);
  });

  it('un documento libre conserva el borrado duro', async () => {
    const tenantId = new Types.ObjectId();
    const libre = await createDocument(tenantId, { titulo: 'Notas propias', contenido: 'texto' });

    await deleteDocument(tenantId, libre.id);

    expect(await KbDocument.findById(libre.id)).toBeNull();
  });

  it('listDocuments sigue devolviendo los ocultos, con el flag en el DTO', async () => {
    const tenantId = new Types.ObjectId();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Políticas y términos',
      contenido: 'texto',
      isPreset: true,
      obligatorio: false,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    await deleteDocument(tenantId, preset._id.toString());

    const listado = await listDocuments(tenantId, 1, 20);
    expect(listado.data).toHaveLength(1);
    expect(listado.data[0]?.oculto).toBe(true);
  });

  it('aislamiento multi-tenant: tenantB no puede ocultar un preset de tenantA', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const preset = await createScoped(KbDocument, tenantA, {
      titulo: 'Políticas y términos',
      contenido: 'texto de A',
      isPreset: true,
      obligatorio: false,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    await expect(deleteDocument(tenantB, preset._id.toString())).rejects.toMatchObject({
      statusCode: 404,
    });

    const saved = await KbDocument.findById(preset._id).lean<IKbDocument>();
    expect(saved?.oculto ?? false).toBe(false);
    expect(saved?.contenido).toBe('texto de A');
  });

  it('aislamiento multi-tenant: el 404 gana al 400 sobre un obligatorio ajeno', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const obligatorio = await createScoped(KbDocument, tenantA, {
      titulo: 'Información de la empresa',
      contenido: 'texto de A',
      isPreset: true,
      obligatorio: true,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    // Un tenant ajeno no debe poder distinguir "no existe" de "existe pero es obligatorio".
    await expect(deleteDocument(tenantB, obligatorio._id.toString())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('ocultar un preset de tenantA no afecta el listado de tenantB', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await seedPresetDocuments(tenantA);
    await seedPresetDocuments(tenantB);

    const presetA = await KbDocument.findOne({ tenantId: tenantA, titulo: 'Políticas y términos' })
      .lean<IKbDocument & { _id: Types.ObjectId }>();
    await deleteDocument(tenantA, presetA!._id.toString());

    const listadoB = await listDocuments(tenantB, 1, 20);
    expect(listadoB.data.every((doc) => doc.oculto === false)).toBe(true);
  });
});

describe('updateDocument — bump de Tenant.kbVersion (HU-KB-03)', () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  it('editar contenido real incrementa kbVersion en 1', async () => {
    const tenantId = await createTenant();
    const created = await createDocument(tenantId, { titulo: 'Editable', contenido: 'v1' });

    await updateDocument(tenantId, created.id, { contenido: 'contenido corregido' });

    expect(await readKbVersion(tenantId)).toBe(2);
  });

  it('vaciar un documento que tenía contenido incrementa kbVersion', async () => {
    const tenantId = await createTenant();
    const created = await createDocument(tenantId, { titulo: 'A vaciar', contenido: 'algo' });

    await updateDocument(tenantId, created.id, { contenido: '   ' });

    expect(await readKbVersion(tenantId)).toBe(2);
  });

  it('primer llenado de un preset vacío incrementa kbVersion aunque la versión del documento no suba', async () => {
    const tenantId = await createTenant();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Información de la empresa',
      contenido: '',
      isPreset: true,
      obligatorio: true,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    const updated = await updateDocument(tenantId, preset._id.toString(), { contenido: 'Contenido real' });

    expect(updated.version).toBe(1); // el contador del documento no sube (comportamiento previo)
    expect(await readKbVersion(tenantId)).toBe(2); // pero sí cambió contenido real de la KB
  });

  it('editar de vacío a vacío no incrementa kbVersion', async () => {
    const tenantId = await createTenant();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Preset vacío',
      contenido: '',
      isPreset: true,
      obligatorio: false,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    await updateDocument(tenantId, preset._id.toString(), { contenido: '   ' });

    expect(await readKbVersion(tenantId)).toBe(1);
  });

  it('aislamiento multi-tenant: editar un documento de tenantA no toca kbVersion de tenantB', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const created = await createDocument(tenantA, { titulo: 'Solo A', contenido: 'v1' });

    await updateDocument(tenantA, created.id, { contenido: 'editado' });

    expect(await readKbVersion(tenantA)).toBe(2);
    expect(await readKbVersion(tenantB)).toBe(1);
  });
});

describe('deleteDocument — bump de Tenant.kbVersion (HU-KB-03)', () => {
  it('borrar un documento con contenido incrementa kbVersion', async () => {
    const tenantId = await createTenant();
    const created = await createDocument(tenantId, { titulo: 'A borrar', contenido: 'x' });

    await deleteDocument(tenantId, created.id);

    expect(await readKbVersion(tenantId)).toBe(2);
  });

  it('borrar un documento vacío (preset sin llenar) también incrementa kbVersion', async () => {
    const tenantId = await createTenant();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Preset sin llenar',
      contenido: '',
      isPreset: true,
      obligatorio: false,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    await deleteDocument(tenantId, preset._id.toString());

    expect(await readKbVersion(tenantId)).toBe(2);
  });

  it('aislamiento multi-tenant: borrar un documento de tenantA no toca kbVersion de tenantB', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const created = await createDocument(tenantA, { titulo: 'Solo A', contenido: 'x' });

    await deleteDocument(tenantA, created.id);

    expect(await readKbVersion(tenantA)).toBe(2);
    expect(await readKbVersion(tenantB)).toBe(1);
  });
});

describe('estructura — conocimiento estructurado (HU-KB-07)', () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  function makeEstructura(nombre: string): KbEstructura {
    return {
      schemaVersion: 1,
      schemaId: 'generico',
      campos: { nombre: { tipo: 'texto', valor: nombre } },
      adicional: 'Notas sueltas',
    };
  }

  it('createDocument persiste la estructura junto al contenido derivado', async () => {
    const tenantId = new Types.ObjectId();
    const estructura = makeEstructura('Acme');

    const res = await createDocument(tenantId, {
      titulo: 'Información de la empresa',
      contenido: 'Nombre: Acme',
      estructura,
    });

    expect(res.estructura).toEqual(estructura);

    const saved = await KbDocument.findById(res.id).lean<IKbDocument>();
    expect(saved?.estructura).toEqual(estructura);
  });

  it('un documento sin estructura se crea igual que antes (retrocompatibilidad)', async () => {
    const tenantId = new Types.ObjectId();
    const res = await createDocument(tenantId, { titulo: 'Libre', contenido: 'Texto suelto' });

    expect(res.estructura).toBeUndefined();
    expect(res.version).toBe(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('contenido igual + estructura igual → NO-OP total (ni updatedAt)', async () => {
    const tenantId = new Types.ObjectId();
    const estructura = makeEstructura('Acme');
    const created = await createDocument(tenantId, {
      titulo: 'Empresa',
      contenido: 'Nombre: Acme',
      estructura,
    });
    mockAdd.mockClear();

    const updated = await updateDocument(tenantId, created.id, {
      contenido: 'Nombre: Acme',
      estructura,
    });

    expect(updated.version).toBe(created.version);
    expect(updated.updatedAt).toBe(created.updatedAt); // la fecha NO se toca
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('contenido igual + estructura distinta → persiste la estructura y nada más', async () => {
    const tenantId = await createTenant();
    const created = await createDocument(tenantId, {
      titulo: 'Empresa',
      contenido: 'Nombre: Acme',
      estructura: makeEstructura('Acme'),
    });
    await createScoped(KbChunk, tenantId, {
      documentId: created.id,
      version: created.version,
      chunkIndex: 0,
      texto: 'Nombre: Acme',
      embedding: [0.1, 0.2],
    });
    const kbVersionAntes = await readKbVersion(tenantId);
    mockAdd.mockClear();

    // Mismo texto serializado, pero el admin tocó «Información adicional».
    const otraEstructura: KbEstructura = { ...makeEstructura('Acme'), adicional: 'Otras notas' };
    const updated = await updateDocument(tenantId, created.id, {
      contenido: 'Nombre: Acme',
      estructura: otraEstructura,
    });

    expect(updated.estructura).toEqual(otraEstructura);
    expect(updated.version).toBe(created.version); // no re-versiona
    expect(mockAdd).not.toHaveBeenCalled(); // no re-indexa
    expect(await readKbVersion(tenantId)).toBe(kbVersionAntes); // no invalida la caché de IA

    const chunks = await findScoped(KbChunk, tenantId, { documentId: created.id });
    expect(chunks).toHaveLength(1); // los fragmentos siguen siendo válidos

    expect(updated.updatedAt).not.toBe(created.updatedAt); // pero SÍ hubo escritura
  });

  it('contenido distinto → camino completo y estructura guardada en la misma escritura', async () => {
    const tenantId = await createTenant();
    const created = await createDocument(tenantId, {
      titulo: 'Empresa',
      contenido: 'Nombre: Acme',
      estructura: makeEstructura('Acme'),
    });
    mockAdd.mockClear();

    const nueva = makeEstructura('Acme S.A.');
    const updated = await updateDocument(tenantId, created.id, {
      contenido: 'Nombre: Acme S.A.',
      estructura: nueva,
    });

    expect(updated.version).toBe(2);
    expect(updated.estructura).toEqual(nueva);
    expect(updated.estadoIndexacion).toBe('pendiente');
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('el primer llenado con estructura sigue sin incrementar la versión', async () => {
    const tenantId = new Types.ObjectId();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Información Complementaria',
      contenido: '',
      isPreset: true,
      obligatorio: false,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });

    const updated = await updateDocument(tenantId, preset._id.toString(), {
      contenido: 'Información adicional\nAlgo que contar',
      estructura: makeEstructura('Acme'),
    });

    expect(updated.version).toBe(1);
    expect(updated.estructura).toBeDefined();
  });

  it('estructura ausente en el DTO no borra la estructura guardada', async () => {
    const tenantId = new Types.ObjectId();
    const estructura = makeEstructura('Acme');
    const created = await createDocument(tenantId, {
      titulo: 'Empresa',
      contenido: 'Nombre: Acme',
      estructura,
    });

    // Guardado "a la vieja usanza": solo contenido, como haría el modo legado.
    const updated = await updateDocument(tenantId, created.id, { contenido: 'Nombre: Acme Corp' });

    expect(updated.version).toBe(2);
    expect(updated.estructura).toEqual(estructura); // intacta
  });

  it('aislamiento multi-tenant: tenantB no lee ni sobrescribe la estructura de tenantA', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const estructuraA = makeEstructura('Solo de A');
    const created = await createDocument(tenantA, {
      titulo: 'Empresa',
      contenido: 'Nombre: Solo de A',
      estructura: estructuraA,
    });

    // Leer: el listado de B no ve el documento de A.
    const listaB = await listDocuments(tenantB, 1, 20);
    expect(listaB.data).toHaveLength(0);

    // Escribir: B no puede pisar la estructura de A ni con el id correcto.
    await expect(
      updateDocument(tenantB, created.id, {
        contenido: 'Nombre: hackeado',
        estructura: makeEstructura('hackeado'),
      }),
    ).rejects.toThrow(AppError);

    const saved = await KbDocument.findById(created.id).lean<IKbDocument>();
    expect(saved?.estructura).toEqual(estructuraA);
  });
});

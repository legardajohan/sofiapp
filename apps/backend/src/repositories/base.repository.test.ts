import { describe, it, expect } from 'vitest';
import { Schema, model, Types } from 'mongoose';
import {
  findScoped,
  findByIdScoped,
  createScoped,
  findOneScoped,
  findOneAndUpdateScoped,
  deleteOneScoped,
} from './base.repository.js';

// Mongo en memoria provisto por tests/globalSetup.ts + tests/setup.ts (conexión global).

interface ITestDoc {
  tenantId: Types.ObjectId;
  telefono: string;
}
const TestSchema = new Schema<ITestDoc>({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  telefono: { type: String, required: true },
});
const TestModel = model<ITestDoc>('TestDoc', TestSchema);

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

describe('findByIdScoped', () => {
  it('no devuelve documentos de otro tenant', async () => {
    const docB = await createScoped(TestModel, tenantB, { telefono: '300-000-0001' });
    const result = await findByIdScoped(TestModel, tenantA, docB._id).exec();
    expect(result).toBeNull();
  });

  it('devuelve el documento si el tenantId coincide', async () => {
    const docA = await createScoped(TestModel, tenantA, { telefono: '300-000-0002' });
    const result = await findByIdScoped(TestModel, tenantA, docA._id).exec();
    expect(result).not.toBeNull();
    expect(result!.telefono).toBe('300-000-0002');
  });
});

describe('createScoped', () => {
  it('fuerza el tenantId del argumento sobre el del data', async () => {
    const doc = await createScoped(TestModel, tenantA, {
      tenantId: tenantB,
      telefono: '301-000-0001',
    });
    expect(doc.tenantId.toString()).toBe(tenantA.toString());
  });
});

describe('findScoped', () => {
  it('nunca devuelve documentos de otro tenant', async () => {
    await createScoped(TestModel, tenantA, { telefono: '302-000-0001' });
    await createScoped(TestModel, tenantA, { telefono: '302-000-0002' });
    await createScoped(TestModel, tenantB, { telefono: '302-000-0003' });

    const resultados = await findScoped(TestModel, tenantB).exec();
    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.telefono).toBe('302-000-0003');
  });
});

describe('findOneScoped', () => {
  it('retorna null si no hay coincidencia en el tenant', async () => {
    await createScoped(TestModel, tenantA, { telefono: '303-000-0001' });
    const result = await findOneScoped(TestModel, tenantB, {
      telefono: '303-000-0001',
    }).exec();
    expect(result).toBeNull();
  });
});

describe('findOneAndUpdateScoped', () => {
  it('solo actualiza documentos del tenant correcto', async () => {
    const docA = await createScoped(TestModel, tenantA, { telefono: '304-000-0001' });

    // Intento de actualizar con tenantB — no debería afectar
    await findOneAndUpdateScoped(
      TestModel,
      tenantB,
      { _id: docA._id },
      { $set: { telefono: '999-999-9999' } },
    ).exec();

    const original = await TestModel.findById(docA._id).exec();
    expect(original?.telefono).toBe('304-000-0001');
  });
});

describe('deleteOneScoped', () => {
  it('solo elimina documentos del tenant correcto', async () => {
    const docA = await createScoped(TestModel, tenantA, { telefono: '305-000-0001' });

    // Intento de borrar con tenantB
    await deleteOneScoped(TestModel, tenantB, { _id: docA._id }).exec();

    const sigue = await TestModel.findById(docA._id).exec();
    expect(sigue).not.toBeNull();
  });
});

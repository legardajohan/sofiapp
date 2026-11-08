import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../repositories/base.repository.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { ContactField } from '../features/contact-field/contact-field.model.js';
import { backfillContactFieldsDeTenant } from './backfill-contact-fields.js';

const tenantId = new Types.ObjectId();
let n = 0;

async function crearCliente(atributos: { key: string; label: string; valor: string; sensible: boolean }[]): Promise<void> {
  n += 1;
  await createScoped(Cliente, tenantId, {
    metaUserId: `wa_bf_${n}`,
    telefono: `5730000000${n}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds: [],
    atributos,
  });
}

beforeEach(async () => {
  await ContactField.deleteMany({});
  await ContactField.syncIndexes();
  await Cliente.deleteMany({});
});

describe('backfillContactFieldsDeTenant (HU-FLOW-05, criterio 6)', () => {
  it('crea una entrada por cada key distinta que aún no está en el catálogo', async () => {
    await crearCliente([{ key: 'colegio', label: 'Colegio', valor: 'Libertad', sensible: false }]);
    await crearCliente([
      { key: 'colegio', label: 'Institución', valor: 'Otro', sensible: false },
      { key: 'ciudad', label: 'Ciudad', valor: 'Pasto', sensible: false },
    ]);

    expect(await backfillContactFieldsDeTenant(tenantId)).toBe(2);

    const campos = await ContactField.find({ tenantId }).sort({ key: 1 }).lean();
    expect(campos.map((c) => c.key)).toEqual(['ciudad', 'colegio']);
    // Toma el primer label encontrado para cada clave.
    expect(campos.find((c) => c.key === 'colegio')?.tipoDato).toBe('texto');
  });

  it('`sensible` es verdadero si lo fue en ALGÚN contacto (OR)', async () => {
    await crearCliente([{ key: 'ingreso', label: 'Ingreso', valor: '1', sensible: false }]);
    await crearCliente([{ key: 'ingreso', label: 'Ingreso', valor: '2', sensible: true }]);

    await backfillContactFieldsDeTenant(tenantId);

    const campo = await ContactField.findOne({ tenantId, key: 'ingreso' }).lean();
    expect(campo?.sensible).toBe(true);
  });

  it('es idempotente: correrlo dos veces no duplica ni modifica nada', async () => {
    await crearCliente([{ key: 'colegio', label: 'Colegio', valor: 'Libertad', sensible: false }]);

    await backfillContactFieldsDeTenant(tenantId);
    const primera = await ContactField.find({ tenantId }).lean();
    expect(await backfillContactFieldsDeTenant(tenantId)).toBe(0);
    const segunda = await ContactField.find({ tenantId }).lean();

    expect(segunda).toEqual(primera);
  });

  it('omite las claves reservadas y las etiquetas ya usadas', async () => {
    await crearCliente([
      { key: 'email', label: 'Email', valor: 'a@b.co', sensible: false },
      { key: 'colegio', label: 'Colegio', valor: 'Libertad', sensible: false },
    ]);

    expect(await backfillContactFieldsDeTenant(tenantId)).toBe(1);
    expect((await ContactField.find({ tenantId }).lean()).map((c) => c.key)).toEqual(['colegio']);
  });
});

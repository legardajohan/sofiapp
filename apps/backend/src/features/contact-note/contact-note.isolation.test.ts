import { describe, it, expect, beforeEach } from 'vitest';
import type { Types } from 'mongoose';
import { fromStoredValue } from '../../utils/field-crypto.util.js';
import { ContactNote } from './contact-note.model.js';
import { deleteNota, updateNota } from './contact-note.service.js';
import {
  crearContacto,
  crearNota,
  crearTenant,
  crearUsuario,
} from '../pendiente/pendiente.fixtures.js';

describe('HU-PDF-01 — aislamiento multi-tenant al editar y borrar notas', () => {
  let tenantA: Types.ObjectId;
  let tenantB: Types.ObjectId;
  let actorA: string;
  let contactoA: string;
  let contactoB: string;
  let notaB: string;

  beforeEach(async () => {
    tenantA = await crearTenant('EmpresaA');
    tenantB = await crearTenant('EmpresaB');
    actorA = await crearUsuario(tenantA, 'Autora A');
    const autorB = await crearUsuario(tenantB, 'Autor B');
    contactoA = await crearContacto(tenantA, { nombre: 'Contacto A' });
    contactoB = await crearContacto(tenantB, { nombre: 'Contacto B' });
    notaB = await crearNota(tenantB, contactoB, autorB, 'Nota de B', { pendiente: true });
  });

  async function notaBIntacta(): Promise<void> {
    const doc = await ContactNote.findById(notaB).lean();
    expect(doc).not.toBeNull();
    expect(fromStoredValue(doc!.textoEnc)).toBe('Nota de B');
    expect(doc!.pendiente).toBe(true);
  }

  it('PATCH desde A sobre una nota de B → 404 y la nota de B no cambia', async () => {
    await expect(
      updateNota(tenantA, actorA, contactoB, notaB, { texto: 'pisada', pendiente: false }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await notaBIntacta();
  });

  it('PATCH desde A con un clienteId propio y la nota de B → 404', async () => {
    await expect(updateNota(tenantA, actorA, contactoA, notaB, { pendiente: false })).rejects.toMatchObject(
      { statusCode: 404 },
    );
    await notaBIntacta();
  });

  it('DELETE desde A sobre una nota de B → 404 y la nota de B sigue existiendo', async () => {
    await expect(deleteNota(tenantA, actorA, contactoB, notaB)).rejects.toMatchObject({
      statusCode: 404,
    });
    await notaBIntacta();
  });

  it('dentro del mismo tenant, una nota de otro contacto tampoco se toca por URL', async () => {
    const autorA = await crearUsuario(tenantA, 'Otro A');
    const otroContacto = await crearContacto(tenantA, { nombre: 'Otro' });
    const notaOtro = await crearNota(tenantA, otroContacto, autorA, 'Nota del otro');
    await expect(deleteNota(tenantA, actorA, contactoA, notaOtro)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await ContactNote.findById(notaOtro).lean()).not.toBeNull();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { ContactField } from './contact-field.model.js';
import {
  archiveContactField,
  assertKeysDelCatalogo,
  createContactField,
  listContactFields,
  registrarCamposHeredados,
  updateContactField,
} from './contact-field.service.js';

const tenantId = new Types.ObjectId();

beforeEach(async () => {
  await ContactField.deleteMany({});
  await ContactField.syncIndexes();
});

describe('contact-field — crear y renombrar (HU-FLOW-05, criterios 3-5)', () => {
  it('crea un campo con la clave derivada del nombre, sin tildes ni espacios', async () => {
    const campo = await createContactField(tenantId, { label: 'Institución Educativa', tipoDato: 'texto' });
    expect(campo).toMatchObject({
      key: 'institucion-educativa',
      label: 'Institución Educativa',
      tipoDato: 'texto',
      sensible: false,
      activo: true,
    });
  });

  it('la clave es estable: renombrar NO la cambia', async () => {
    const creado = await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto' });
    const renombrado = await updateContactField(tenantId, creado.id, { label: 'Institución' });
    expect(renombrado.key).toBe('colegio');
    expect(renombrado.label).toBe('Institución');
  });

  it('una etiqueta repetida (sin tildes ni mayúsculas) → 409', async () => {
    await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto' });
    await expect(createContactField(tenantId, { label: 'COLEGIO', tipoDato: 'texto' })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(createContactField(tenantId, { label: 'Cólegio', tipoDato: 'texto' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('renombrar a una etiqueta que ya usa otro campo → 409', async () => {
    await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto' });
    const otro = await createContactField(tenantId, { label: 'Ciudad', tipoDato: 'texto' });
    await expect(updateContactField(tenantId, otro.id, { label: 'colegio' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it.each(['nombre', 'Email', 'Teléfono', 'documento', 'Rol de contacto'.replace(/ de /, ' '), 'Nivel Interés'])(
    'el nombre reservado «%s» → 400 con la indicación de usar el campo fijo',
    async (label) => {
      await expect(createContactField(tenantId, { label, tipoDato: 'texto' })).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('dato fijo'),
      });
    },
  );

  it('renombrar a un nombre reservado → 400', async () => {
    const campo = await createContactField(tenantId, { label: 'Ciudad', tipoDato: 'texto' });
    await expect(updateContactField(tenantId, campo.id, { label: 'Correo' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('dos nombres distintos con el mismo slug reciben claves distintas', async () => {
    const a = await createContactField(tenantId, { label: 'Colegio 1', tipoDato: 'texto' });
    const b = await createContactField(tenantId, { label: 'Colegio-1', tipoDato: 'texto' });
    expect(a.key).toBe('colegio-1');
    expect(b.key).toBe('colegio-1-2');
  });

  it('los campos nuevos van al final del orden', async () => {
    const a = await createContactField(tenantId, { label: 'Uno', tipoDato: 'texto' });
    const b = await createContactField(tenantId, { label: 'Dos', tipoDato: 'numero' });
    expect(b.orden).toBe(a.orden + 1);
  });
});

describe('contact-field — archivar (criterio 5)', () => {
  it('archivar lo saca del listado por defecto pero sigue en el catálogo completo', async () => {
    const campo = await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto' });
    await archiveContactField(tenantId, campo.id);

    expect(await listContactFields(tenantId)).toHaveLength(0);
    const todos = await listContactFields(tenantId, { incluirArchivados: true });
    expect(todos).toEqual([expect.objectContaining({ key: 'colegio', activo: false })]);
  });

  it('volver a crear un campo archivado lo reactiva en vez de chocar', async () => {
    const campo = await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto' });
    await archiveContactField(tenantId, campo.id);

    const de_vuelta = await createContactField(tenantId, { label: 'Colegio', tipoDato: 'numero', sensible: true });

    expect(de_vuelta).toMatchObject({ id: campo.id, activo: true, tipoDato: 'numero', sensible: true });
    expect(await ContactField.countDocuments({})).toBe(1);
  });

  it('archivar un id inexistente → 404', async () => {
    await expect(archiveContactField(tenantId, new Types.ObjectId().toString())).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('assertKeysDelCatalogo', () => {
  it('una clave inexistente → 400 indicando la clave', async () => {
    await expect(assertKeysDelCatalogo(tenantId, ['no-existe'])).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('no-existe'),
    });
  });

  it('una clave archivada se rechaza, salvo que esté en `archivadasPermitidas`', async () => {
    const campo = await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto' });
    await archiveContactField(tenantId, campo.id);

    await expect(assertKeysDelCatalogo(tenantId, ['colegio'])).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      assertKeysDelCatalogo(tenantId, ['colegio'], { archivadasPermitidas: ['colegio'] }),
    ).resolves.toBeInstanceOf(Map);
  });

  it('devuelve los campos del catálogo por clave', async () => {
    await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto', sensible: true });
    const mapa = await assertKeysDelCatalogo(tenantId, ['colegio']);
    expect(mapa.get('colegio')).toMatchObject({ tipoDato: 'texto', sensible: true });
  });
});

describe('registrarCamposHeredados', () => {
  it('registra los atributos que faltan y es idempotente', async () => {
    const atributos = [
      { key: 'colegio', label: 'Colegio', sensible: false },
      { key: 'ingreso', label: 'Ingreso', sensible: true },
    ];
    expect(await registrarCamposHeredados(tenantId, atributos)).toBe(2);
    expect(await registrarCamposHeredados(tenantId, atributos)).toBe(0);
    expect(await ContactField.countDocuments({})).toBe(2);
  });

  it('omite los que chocan con una clave reservada o con una etiqueta ya usada', async () => {
    await createContactField(tenantId, { label: 'Colegio', tipoDato: 'texto' });
    const creados = await registrarCamposHeredados(tenantId, [
      { key: 'email', label: 'Email', sensible: false },
      { key: 'institucion', label: 'colegio', sensible: false },
    ]);
    expect(creados).toBe(0);
  });
});

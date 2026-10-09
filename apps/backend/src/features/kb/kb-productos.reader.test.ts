import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { KbDocument } from './kb-document.model.js';
import {
  KB_CAMPO_CATALOGO,
  KB_SCHEMA_PRODUCTOS,
  listarProductosKb,
  normalizarClave,
} from './kb-productos.reader.js';

/*
 * HU-REP-03, criterio 1. El backend guarda `estructura` sin interpretarla; este lector es el único
 * que la lee, apoyado en los ids que HU-KB-09 congeló. Si alguno de estos tests falla tras tocar
 * `productos.schema.ts` en el frontend, el reporte de productos se ha quedado ciego.
 */

type Item = Record<string, unknown>;

function estructuraProductos(items: Item[], schemaId = 'productos'): Record<string, unknown> {
  return {
    schemaVersion: 1,
    schemaId,
    campos: { catalogo: { tipo: 'repetible', items } },
    adicional: '',
  };
}

async function crearDoc(
  tenantId: Types.ObjectId,
  estructura: unknown,
  opts: { titulo?: string; oculto?: boolean } = {},
): Promise<void> {
  await createScoped(KbDocument, tenantId, {
    titulo: opts.titulo ?? 'Productos y servicios',
    contenido: 'x',
    oculto: opts.oculto ?? false,
    ...(estructura !== undefined ? { estructura } : {}),
  });
}

describe('HU-REP-03 — lector de productos de la KB', () => {
  let tenant: Types.ObjectId;

  beforeEach(async () => {
    tenant = new Types.ObjectId();
    await KbDocument.syncIndexes();
  });

  it('fija los ids congelados por HU-KB-09', () => {
    expect(KB_SCHEMA_PRODUCTOS).toBe('productos');
    expect(KB_CAMPO_CATALOGO).toBe('catalogo');
  });

  it('lee las filas { nombre, descripcion } de la estructura productos', async () => {
    await crearDoc(
      tenant,
      estructuraProductos([
        { nombre: 'Curso Pre-ICFES intensivo', descripcion: 'Seis semanas' },
        { nombre: 'Asesoría', descripcion: '' },
      ]),
    );

    const { productos, version } = await listarProductosKb(tenant.toString());

    expect(productos).toEqual([
      { clave: 'curso pre-icfes intensivo', nombre: 'Curso Pre-ICFES intensivo', descripcion: 'Seis semanas' },
      { clave: 'asesoria', nombre: 'Asesoría' },
    ]);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('ignora filas sin nombre, deduplica por clave y descarta «Otros»', async () => {
    await crearDoc(
      tenant,
      estructuraProductos([
        { nombre: '  ', descripcion: 'sin nombre' },
        { descripcion: 'tampoco' },
        'no-es-objeto' as unknown as Item,
        { nombre: 'Curso  Sabatino' },
        { nombre: 'curso sabatino', descripcion: 'repetido' },
        { nombre: 'Otros' },
      ]),
    );

    const { productos } = await listarProductosKb(tenant.toString());

    expect(productos).toEqual([{ clave: 'curso sabatino', nombre: 'Curso  Sabatino' }]);
  });

  it.each([
    ['sin estructura', undefined],
    ['otro schema', estructuraProductos([{ nombre: 'X' }], 'empresa')],
    ['catalogo no repetible', { schemaId: 'productos', campos: { catalogo: { tipo: 'lista', valores: ['X'] } } }],
    ['items no array', { schemaId: 'productos', campos: { catalogo: { tipo: 'repetible', items: 'X' } } }],
    ['campos ausentes', { schemaId: 'productos' }],
    ['estructura escalar', 'basura'],
  ])('forma inesperada (%s) → lista vacía, sin lanzar', async (_caso, estructura) => {
    await crearDoc(tenant, estructura);
    await expect(listarProductosKb(tenant.toString())).resolves.toEqual({ productos: [], version: '' });
  });

  it('ignora el documento oculto', async () => {
    await crearDoc(tenant, estructuraProductos([{ nombre: 'Curso' }]), { oculto: true });
    expect((await listarProductosKb(tenant.toString())).productos).toEqual([]);
  });

  it('la versión cambia al editar un producto y no al reordenar', async () => {
    await crearDoc(tenant, estructuraProductos([{ nombre: 'A', descripcion: 'uno' }, { nombre: 'B' }]));
    const v1 = (await listarProductosKb(tenant.toString())).version;

    await KbDocument.updateOne(
      { tenantId: tenant },
      { $set: { estructura: estructuraProductos([{ nombre: 'B' }, { nombre: 'A', descripcion: 'uno' }]) } },
    );
    const reordenada = (await listarProductosKb(tenant.toString())).version;

    await KbDocument.updateOne(
      { tenantId: tenant },
      { $set: { estructura: estructuraProductos([{ nombre: 'A', descripcion: 'dos' }, { nombre: 'B' }]) } },
    );
    const editada = (await listarProductosKb(tenant.toString())).version;

    expect(reordenada).toBe(v1);
    expect(editada).not.toBe(v1);
  });

  it('no lee la KB de otro tenant', async () => {
    const otro = new Types.ObjectId();
    await crearDoc(otro, estructuraProductos([{ nombre: 'Producto de B' }]));

    expect((await listarProductosKb(tenant.toString())).productos).toEqual([]);
    expect((await listarProductosKb(otro.toString())).productos).toHaveLength(1);
  });

  it('normalizarClave: minúsculas, sin acentos y espacios colapsados', () => {
    expect(normalizarClave('  Curso   Pre-ICFES  Matemáticas ')).toBe('curso pre-icfes matematicas');
  });
});

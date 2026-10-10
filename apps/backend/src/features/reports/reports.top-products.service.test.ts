import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { getTopProducts } from './reports.service.js';
import { topProductsQuerySchema, type TopProductsQuery } from './reports.validation.js';
import type { ITopProductsResponse } from './reports.types.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { clasificarHilo, crearHilo, crearMensaje, crearProductosKb } from './reports.fixtures.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const EN_RANGO = new Date('2026-09-20T10:00:00Z');
const ANTES = new Date('2026-08-01T10:00:00Z');
const RANGO = { desde: new Date('2026-09-01T00:00:00Z'), hasta: new Date('2026-09-30T23:59:59.999Z') };

const query = (raw: Record<string, unknown> = {}): TopProductsQuery =>
  topProductsQuerySchema.parse({ query: { desde: '2026-09-01', hasta: '2026-09-30', ...raw } }).query;

/** Un hilo con `mensajes` del cliente en `fecha`, clasificado (o no) con `tema`. */
async function hilo(
  tenant: Types.ObjectId,
  tema: string | null | undefined,
  opts: { fecha?: Date; demo?: boolean; mensajes?: number } = {},
): Promise<Types.ObjectId> {
  const id = await crearHilo(tenant, null, { demo: opts.demo });
  for (let i = 0; i < (opts.mensajes ?? 1); i += 1) await crearMensaje(tenant, id, 'user', opts.fecha ?? EN_RANGO);
  if (tema !== undefined) await clasificarHilo(tenant, id, tema);
  return id;
}

/**
 * El DoD calculado APARTE: conversaciones del tenant (no demo, cliente existente) con algún mensaje
 * del cliente en el rango, agrupadas por `temaIA.clave` — leído directamente con el driver.
 */
async function conteoIndependiente(tenant: Types.ObjectId): Promise<Map<string, number>> {
  const msgs = await Message.collection
    .find({ tenantId: tenant, sender: 'user', createdAt: { $gte: RANGO.desde, $lte: RANGO.hasta } })
    .toArray();
  const ids = [...new Set(msgs.map((m) => String(m['clienteId'])))];
  const clientes = await Cliente.collection
    .find({ tenantId: tenant, _id: { $in: ids.map((i) => new Types.ObjectId(i)) } })
    .toArray();
  const conteo = new Map<string, number>();
  for (const c of clientes) {
    if (String(c['metaUserId']).startsWith('demo-')) continue;
    const tema = c['temaIA'] as { clave: string | null } | undefined;
    const k = tema === undefined ? '__sin' : (tema.clave ?? '__otros');
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }
  return conteo;
}

const suma = (r: ITopProductsResponse): number =>
  r.ranking.reduce((s, f) => s + f.conversaciones, 0) + r.restantes.conversaciones + r.otros.conversaciones;

describe('HU-REP-03 — getTopProducts', () => {
  it('DoD: cada fila coincide con el conteo calculado aparte, y los totales cuadran', async () => {
    const tenant = new Types.ObjectId();
    await crearProductosKb(tenant, ['Curso intensivo', 'Curso sabatino', 'Asesoría']);
    for (let i = 0; i < 4; i += 1) await hilo(tenant, 'Curso intensivo', { mensajes: 1 + (i % 3) });
    for (let i = 0; i < 2; i += 1) await hilo(tenant, 'Curso sabatino');
    await hilo(tenant, 'Asesoría');
    await hilo(tenant, null);
    await hilo(tenant, null);
    await hilo(tenant, undefined);

    const r = await getTopProducts(tenant.toString(), query(), NOW);
    const aparte = await conteoIndependiente(tenant);

    for (const fila of r.ranking) expect(fila.conversaciones).toBe(aparte.get(fila.clave));
    expect(r.otros.conversaciones).toBe(aparte.get('__otros'));
    expect(r.sinClasificar).toBe(aparte.get('__sin'));
    expect(r).toMatchObject({ totalConsultas: 10, clasificadas: 9, sinClasificar: 1, catalogoDisponible: true });
    expect(suma(r)).toBe(r.clasificadas);
    expect(r.clasificadas + r.sinClasificar).toBe(r.totalConsultas);
    expect(r.ranking.map((f) => [f.nombre, f.conversaciones, f.share])).toEqual([
      ['Curso intensivo', 4, 0.4444],
      ['Curso sabatino', 2, 0.2222],
      ['Asesoría', 1, 0.1111],
    ]);
    expect(r.otros).toEqual({ conversaciones: 2, share: 0.2222 });
  });

  it('fuera de rango, demo y huérfanos no cuentan', async () => {
    const tenant = new Types.ObjectId();
    await crearProductosKb(tenant, ['Curso intensivo']);
    await hilo(tenant, 'Curso intensivo');
    await hilo(tenant, 'Curso intensivo', { fecha: ANTES });
    await hilo(tenant, 'Curso intensivo', { demo: true });
    // Mensaje de un cliente que no existe (borrado).
    await crearMensaje(tenant, new Types.ObjectId(), 'user', EN_RANGO);
    // Mensajes del bot o del asesor no son consultas.
    const soloEmpresa = await crearHilo(tenant, null);
    await crearMensaje(tenant, soloEmpresa, 'bot', EN_RANGO);
    await crearMensaje(tenant, soloEmpresa, 'agent', EN_RANGO);
    await clasificarHilo(tenant, soloEmpresa, 'Curso intensivo');

    const r = await getTopProducts(tenant.toString(), query(), NOW);

    expect(r.totalConsultas).toBe(1);
    expect(r.ranking).toEqual([
      { clave: 'curso intensivo', nombre: 'Curso intensivo', enCatalogo: true, conversaciones: 1, share: 1 },
    ]);
  });

  it('top recorta el ranking y el resto va a restantes', async () => {
    const tenant = new Types.ObjectId();
    const nombres = ['A', 'B', 'C', 'D'];
    await crearProductosKb(tenant, nombres);
    for (const [i, n] of nombres.entries()) {
      for (let k = 0; k < 4 - i; k += 1) await hilo(tenant, n);
    }

    const r = await getTopProducts(tenant.toString(), query({ top: 2 }), NOW);

    expect(r.ranking.map((f) => f.nombre)).toEqual(['A', 'B']);
    expect(r.restantes).toEqual({ productos: 2, conversaciones: 3, share: 0.3 });
    expect(suma(r)).toBe(r.clasificadas);
  });

  it('empate en conversaciones: desempata por nombre', async () => {
    const tenant = new Types.ObjectId();
    await crearProductosKb(tenant, ['Zeta', 'Alfa']);
    await hilo(tenant, 'Zeta');
    await hilo(tenant, 'Alfa');

    const r = await getTopProducts(tenant.toString(), query(), NOW);

    expect(r.ranking.map((f) => f.nombre)).toEqual(['Alfa', 'Zeta']);
  });

  it('un producto retirado de la KB sale con enCatalogo: false y su nombre guardado', async () => {
    const tenant = new Types.ObjectId();
    await crearProductosKb(tenant, ['Curso intensivo']);
    await hilo(tenant, 'Curso de verano');

    const r = await getTopProducts(tenant.toString(), query(), NOW);

    expect(r.ranking).toEqual([
      { clave: 'curso de verano', nombre: 'Curso de verano', enCatalogo: false, conversaciones: 1, share: 1 },
    ]);
  });

  it('el nombre vigente de la KB manda sobre el guardado', async () => {
    const tenant = new Types.ObjectId();
    await crearProductosKb(tenant, ['Asesoría']);
    await hilo(tenant, 'asesoria');

    const r = await getTopProducts(tenant.toString(), query(), NOW);

    expect(r.ranking[0]).toMatchObject({ nombre: 'Asesoría', enCatalogo: true });
  });

  it('sin productos en la KB: catalogoDisponible false y todo sin clasificar', async () => {
    const tenant = new Types.ObjectId();
    await hilo(tenant, undefined);
    await hilo(tenant, undefined);

    const r = await getTopProducts(tenant.toString(), query(), NOW);

    expect(r).toMatchObject({
      catalogoDisponible: false,
      totalConsultas: 2,
      clasificadas: 0,
      sinClasificar: 2,
      ranking: [],
      otros: { conversaciones: 0, share: 0 },
    });
  });

  it('un hilo con varios mensajes en el rango cuenta una sola consulta', async () => {
    const tenant = new Types.ObjectId();
    await crearProductosKb(tenant, ['Curso intensivo']);
    await hilo(tenant, 'Curso intensivo', { mensajes: 5 });

    const r = await getTopProducts(tenant.toString(), query(), NOW);

    expect(r.totalConsultas).toBe(1);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { getGlobalMetrics, normalizeHasta, ratio, ultimosPeriodos } from './admin-metrics.service.js';
import { globalMetricsQuerySchema, type GlobalMetricsQueryInput } from './admin-metrics.validation.js';
import { crearPlan, crearTenant, sembrar } from './admin-metrics.fixtures.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');

function query(raw: Record<string, unknown> = {}): GlobalMetricsQueryInput {
  return globalMetricsQuerySchema.parse({ query: raw }).query;
}

describe('HU-SAAS-03 — helpers puros', () => {
  it('ultimosPeriodos: 6 meses consecutivos que cruzan el año', () => {
    expect(ultimosPeriodos(new Date('2026-02-15T00:00:00Z'), 6)).toEqual([
      '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
  });

  it('ratio: 0 sin leads y 4 decimales', () => {
    expect(ratio(0, 0)).toBe(0);
    expect(ratio(1, 3)).toBe(0.3333);
  });

  it('normalizeHasta: una fecha sin hora cubre el día completo', () => {
    expect(normalizeHasta(new Date('2026-09-30')).toISOString()).toBe('2026-09-30T23:59:59.999Z');
    const conHora = new Date('2026-09-30T10:00:00Z');
    expect(normalizeHasta(conHora)).toBe(conHora);
  });
});

describe('HU-SAAS-03 — getGlobalMetrics', () => {
  let pro: Types.ObjectId;
  let acme: Types.ObjectId;
  let beta: Types.ObjectId;

  beforeEach(async () => {
    pro = await crearPlan('Pro');
    acme = await crearTenant('Acme', { estado: 'activo', planId: pro });
    beta = await crearTenant('Beta', { estado: 'prueba' });
    await crearTenant('Zeta', { estado: 'suspendido', planId: pro });

    const reciente = new Date('2026-10-01T10:00:00Z');
    await sembrar(acme, '1', {
      usuarios: 3, usuariosInactivos: 1, clientes: 5, mensajesIn: 4, mensajesOut: 6,
      leads: 4, ventas: 1, campanas: 2, createdAt: reciente,
    });
    await sembrar(beta, '2', {
      usuarios: 1, clientes: 2, mensajesIn: 1, leads: 10, ventas: 5, campanas: 1,
      createdAt: new Date('2026-06-15T10:00:00Z'),
    });
  });

  it('consolidado = suma de todas las filas; ventas = leads en `pagado`', async () => {
    const r = await getGlobalMetrics(query({ limit: 100 }), NOW);
    const filas = r.porEmpresa.items;
    const suma = (k: 'usuarios' | 'conversaciones' | 'mensajes' | 'leads' | 'ventas' | 'campanas'): number =>
      filas.reduce((s, f) => s + f[k], 0);

    expect(r.consolidado.empresas.total).toBe(3);
    expect(r.consolidado.empresas.porEstado).toEqual({ activo: 1, suspendido: 1, prueba: 1 });
    expect(r.consolidado.usuarios).toEqual({ total: suma('usuarios'), activos: 4 });
    expect(r.consolidado.usuarios.total).toBe(5);
    expect(r.consolidado.conversaciones.total).toBe(suma('conversaciones'));
    expect(r.consolidado.mensajes.inbound + r.consolidado.mensajes.outbound).toBe(suma('mensajes'));
    expect(r.consolidado.leads).toBe(suma('leads'));
    expect(r.consolidado.ventas).toBe(6);
    expect(r.consolidado.tasaConversion).toBe(ratio(6, 14));
    expect(r.consolidado.campanas.total).toBe(suma('campanas'));
    expect(r.consolidado.campanas.porEstado.completada).toBe(2);

    const filaAcme = filas.find((f) => f.nombre === 'Acme');
    expect(filaAcme).toMatchObject({ leads: 4, ventas: 1, tasaConversion: 0.25, plan: { nombre: 'Pro' } });
  });

  it('planes: agrupa por plan e incluye "Sin plan"', async () => {
    const r = await getGlobalMetrics(query(), NOW);
    expect(r.consolidado.planes).toEqual([
      { planId: String(pro), nombre: 'Pro', empresas: 2 },
      { planId: null, nombre: 'Sin plan', empresas: 1 },
    ]);
  });

  it('el superadmin (tenantId null) no cuenta y un tenantId huérfano no genera fila', async () => {
    await sembrar(null, '9', { usuarios: 2 });
    const huerfano = new Types.ObjectId();
    await sembrar(huerfano, '8', { usuarios: 7, leads: 9, ventas: 9, clientes: 3 });

    const r = await getGlobalMetrics(query({ limit: 100 }), NOW);
    expect(r.porEmpresa.total).toBe(3);
    expect(r.porEmpresa.items.some((f) => f.tenantId === String(huerfano))).toBe(false);
    expect(r.consolidado.usuarios.total).toBe(5);
    expect(r.consolidado.leads).toBe(14);
  });

  it('desde/hasta filtra conversaciones, mensajes, leads y campañas; no empresas ni usuarios', async () => {
    const r = await getGlobalMetrics(query({ desde: '2026-09-01', hasta: '2026-10-31', limit: 100 }), NOW);
    expect(r.rango).toEqual({ desde: '2026-09-01T00:00:00.000Z', hasta: '2026-10-31T23:59:59.999Z' });
    expect(r.consolidado.leads).toBe(4);
    expect(r.consolidado.ventas).toBe(1);
    expect(r.consolidado.conversaciones.total).toBe(5);
    expect(r.consolidado.mensajes).toEqual({ inbound: 4, outbound: 6 });
    expect(r.consolidado.campanas.total).toBe(2);
    expect(r.consolidado.empresas.total).toBe(3);
    expect(r.consolidado.usuarios.total).toBe(5);
  });

  it('activas sin rango = últimos 30 días', async () => {
    const r = await getGlobalMetrics(query(), NOW);
    expect(r.consolidado.conversaciones).toEqual({ total: 7, activas: 5 });
  });

  it('serieMensual: 6 periodos con ceros donde no hay datos', async () => {
    const r = await getGlobalMetrics(query(), NOW);
    expect(r.serieMensual.map((p) => p.periodo)).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    expect(r.serieMensual[1]).toEqual({ periodo: '2026-06', conversaciones: 2, leads: 10, ventas: 5 });
    expect(r.serieMensual[2]).toEqual({ periodo: '2026-07', conversaciones: 0, leads: 0, ventas: 0 });
    expect(r.serieMensual[5]).toEqual({ periodo: '2026-10', conversaciones: 5, leads: 4, ventas: 1 });
  });

  it('desglose: orden, desempate por nombre y paginación', async () => {
    const porVentas = await getGlobalMetrics(query({ sort: 'ventas', order: 'desc' }), NOW);
    expect(porVentas.porEmpresa.items.map((f) => f.nombre)).toEqual(['Beta', 'Acme', 'Zeta']);

    const porNombre = await getGlobalMetrics(query({ sort: 'nombre', order: 'asc', page: 2, limit: 1 }), NOW);
    expect(porNombre.porEmpresa).toMatchObject({ page: 2, limit: 1, total: 3 });
    expect(porNombre.porEmpresa.items.map((f) => f.nombre)).toEqual(['Beta']);
  });

  it('search y estado filtran el desglose sin alterar el consolidado', async () => {
    const todo = await getGlobalMetrics(query(), NOW);
    const r = await getGlobalMetrics(query({ search: 'ACM' }), NOW);
    expect(r.porEmpresa.items.map((f) => f.nombre)).toEqual(['Acme']);
    expect(r.consolidado).toEqual(todo.consolidado);

    const susp = await getGlobalMetrics(query({ estado: 'suspendido' }), NOW);
    expect(susp.porEmpresa.items.map((f) => f.nombre)).toEqual(['Zeta']);
    expect(susp.consolidado).toEqual(todo.consolidado);
  });
});

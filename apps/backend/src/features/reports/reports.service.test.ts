import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { getAdvisorReport, resolverRango } from './reports.service.js';
import { advisorReportQuerySchema, type AdvisorReportQuery } from './reports.validation.js';
import { AuditEvent } from '../audit/audit.model.js';
import { crearAsesor, crearHilo, crearLead, crearMensaje } from './reports.fixtures.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const EN_RANGO = new Date('2026-09-20T10:00:00Z');
const ANTES = new Date('2026-08-01T10:00:00Z');

function query(raw: Record<string, unknown> = {}): AdvisorReportQuery {
  return advisorReportQuerySchema.parse({ query: raw }).query;
}

const SEPTIEMBRE = { desde: '2026-09-01', hasta: '2026-09-30' };

describe('HU-REP-01 — rango', () => {
  it('por defecto: últimos 30 días hasta el fin de hoy (UTC)', () => {
    const r = resolverRango(query(), NOW);
    expect(r.hasta.toISOString()).toBe('2026-10-08T23:59:59.999Z');
    expect(r.desde.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('un rango mayor a 366 días se rechaza aunque una punta venga por defecto', () => {
    expect(() => resolverRango(query({ desde: '2024-01-01' }), NOW)).toThrow(/366/);
  });
});

describe('HU-REP-01 — getAdvisorReport', () => {
  const tenant = new Types.ObjectId();
  const tid = tenant.toString();
  let laura: Types.ObjectId;
  let pedro: Types.ObjectId;

  beforeEach(async () => {
    await AuditEvent.syncIndexes();
    laura = await crearAsesor(tenant, 'Laura');
    pedro = await crearAsesor(tenant, 'Pedro');
  });

  it('atendida exige una respuesta humana (agent) dentro del rango', async () => {
    const conAgente = await crearHilo(tenant, laura, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, conAgente, 'user', EN_RANGO);
    await crearMensaje(tenant, conAgente, 'agent', EN_RANGO);
    await crearMensaje(tenant, conAgente, 'agent', EN_RANGO); // dos respuestas: un solo hilo

    const soloBot = await crearHilo(tenant, laura, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, soloBot, 'bot', EN_RANGO);

    const fueraDeRango = await crearHilo(tenant, laura, { ultimoMensajeAt: ANTES });
    await crearMensaje(tenant, fueraDeRango, 'agent', ANTES);

    const r = await getAdvisorReport(tid, query(SEPTIEMBRE), NOW);
    const fila = r.porAsesor.find((f) => f.nombre === 'Laura');
    expect(fila).toMatchObject({ conversacionesAtendidas: 1, asignadasActivas: 2 });
  });

  it('los hilos demo nunca cuentan; un hilo reasignado cuenta para el asesor actual', async () => {
    const demo = await crearHilo(tenant, laura, { demo: true, ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, demo, 'agent', EN_RANGO);
    // Laura respondió, pero el hilo hoy es de Pedro: Message no guarda autor (limitación aceptada).
    const reasignado = await crearHilo(tenant, pedro, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, reasignado, 'agent', EN_RANGO);

    const r = await getAdvisorReport(tid, query(SEPTIEMBRE), NOW);
    expect(r.porAsesor.find((f) => f.nombre === 'Laura')).toMatchObject({ conversacionesAtendidas: 0, asignadasActivas: 0 });
    expect(r.porAsesor.find((f) => f.nombre === 'Pedro')).toMatchObject({ conversacionesAtendidas: 1 });
  });

  it('venta = paso a pagado dentro del rango y sigue pagado, atribuida al responsable', async () => {
    await crearLead(tenant, laura, 'pagado', [{ a: 'pagado', at: EN_RANGO }]); // lead viejo, pagado en rango → cuenta
    await crearLead(tenant, laura, 'pagado', [{ a: 'pagado', at: ANTES }]); // pagado antes → no
    await crearLead(tenant, laura, 'perdido', [
      { a: 'pagado', at: EN_RANGO },
      { a: 'perdido', at: new Date('2026-09-25T10:00:00Z') },
    ]); // revertido → no
    await crearLead(tenant, pedro, 'pagado', [
      { a: 'pagado', at: EN_RANGO },
      { a: 'en_gestion', at: new Date('2026-09-21T10:00:00Z') },
      { a: 'pagado', at: new Date('2026-09-22T10:00:00Z') },
    ]); // dos veces a pagado → una venta
    await crearLead(tenant, pedro, 'pagado', [{ a: 'pagado', at: EN_RANGO, accion: 'lead.update' }]); // legacy → cuenta

    const r = await getAdvisorReport(tid, query(SEPTIEMBRE), NOW);
    expect(r.porAsesor.find((f) => f.nombre === 'Laura')?.ventas).toBe(1);
    expect(r.porAsesor.find((f) => f.nombre === 'Pedro')?.ventas).toBe(2);
    expect(r.totales.ventas).toBe(3);
  });

  it('activos sin actividad salen en 0; inactivos solo con cifras; huérfanos a sinAsignar', async () => {
    const exInactiva = await crearAsesor(tenant, 'Ana', { activo: false });
    await crearAsesor(tenant, 'Bruno', { activo: false });
    const hiloAna = await crearHilo(tenant, exInactiva, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, hiloAna, 'agent', EN_RANGO);

    const sinAsesor = await crearHilo(tenant, null, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, sinAsesor, 'agent', EN_RANGO);
    const usuarioBorrado = await crearHilo(tenant, new Types.ObjectId(), { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, usuarioBorrado, 'agent', EN_RANGO);
    await crearLead(tenant, null, 'pagado', [{ a: 'pagado', at: EN_RANGO }]);

    const r = await getAdvisorReport(tid, query(SEPTIEMBRE), NOW);
    const nombres = r.porAsesor.map((f) => f.nombre);
    expect(nombres).toEqual(['Ana', 'Laura', 'Pedro']);
    expect(r.porAsesor.find((f) => f.nombre === 'Ana')).toMatchObject({ activo: false, conversacionesAtendidas: 1 });
    expect(r.porAsesor.find((f) => f.nombre === 'Laura')).toMatchObject({ conversacionesAtendidas: 0, ventas: 0, tasaCierre: 0 });
    expect(r.sinAsignar).toEqual({ conversacionesAtendidas: 2, ventas: 1 });
  });

  it('DoD: los totales = Σ filas + sin asignar = conteos operativos del periodo', async () => {
    for (let i = 0; i < 3; i += 1) {
      const h = await crearHilo(tenant, laura, { ultimoMensajeAt: EN_RANGO });
      await crearMensaje(tenant, h, 'agent', EN_RANGO);
    }
    const hp = await crearHilo(tenant, pedro, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, hp, 'agent', EN_RANGO);
    const hs = await crearHilo(tenant, null, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenant, hs, 'agent', EN_RANGO);
    await crearLead(tenant, laura, 'pagado', [{ a: 'pagado', at: EN_RANGO }]);
    await crearLead(tenant, pedro, 'pagado', [{ a: 'pagado', at: EN_RANGO }]);

    const r = await getAdvisorReport(tid, query(SEPTIEMBRE), NOW);
    const sumaFilas = r.porAsesor.reduce((s, f) => s + f.conversacionesAtendidas, 0);
    const ventasFilas = r.porAsesor.reduce((s, f) => s + f.ventas, 0);

    // Conteos operativos sembrados: 5 hilos con respuesta humana en el rango, 2 leads pagados.
    expect(r.totales.conversacionesAtendidas).toBe(5);
    expect(sumaFilas + r.sinAsignar.conversacionesAtendidas).toBe(5);
    expect(r.totales.ventas).toBe(2);
    expect(ventasFilas + r.sinAsignar.ventas).toBe(2);
    expect(r.totales.tasaCierre).toBe(0.4);
    expect(r.porAsesor[0]).toMatchObject({ nombre: 'Laura', conversacionesAtendidas: 3, ventas: 1, tasaCierre: 0.3333 });
  });

  it('existe el índice { tenantId, accion, createdAt } en audit_events', async () => {
    const indices = await AuditEvent.collection.indexes();
    expect(indices.some((i) => JSON.stringify(i.key) === JSON.stringify({ tenantId: 1, accion: 1, createdAt: -1 }))).toBe(true);
  });
});

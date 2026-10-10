import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { getHandoffRate } from './reports.service.js';
import { handoffRateQuerySchema, type HandoffRateQuery } from './reports.validation.js';
import type { IHandoffRateResponse } from './reports.types.js';
import { AuditEvent } from '../audit/audit.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { MOTIVOS_HANDOFF } from '../ai/ai-handoff.types.js';
import { crearHandoff, crearHilo, crearMensaje } from './reports.fixtures.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const EN_RANGO = new Date('2026-09-20T10:00:00Z');
const MAS_TARDE = new Date('2026-09-25T10:00:00Z');
const ANTES = new Date('2026-08-01T10:00:00Z');

const SEPTIEMBRE = { desde: '2026-09-01', hasta: '2026-09-30' };
const query = (raw: Record<string, unknown> = SEPTIEMBRE): HandoffRateQuery =>
  handoffRateQuerySchema.parse({ query: raw }).query;

const porMotivo = (r: IHandoffRateResponse, m: string): number =>
  r.transferidasPorMotivo.find((f) => f.motivo === m)?.conversaciones ?? -1;

describe('HU-REP-02 — getHandoffRate', () => {
  const tenant = new Types.ObjectId();
  const tid = tenant.toString();

  beforeEach(async () => {
    await AuditEvent.syncIndexes();
  });

  it('sin datos: todo en 0 y los 5 motivos presentes en orden', async () => {
    const r = await getHandoffRate(tid, query(), NOW);
    expect(r).toMatchObject({
      conversacionesIa: 0,
      transferidas: 0,
      resueltasPorIa: 0,
      handoffsRegistrados: 0,
      tasaEscalamiento: 0,
    });
    expect(r.transferidasPorMotivo.map((f) => f.motivo)).toEqual([...MOTIVOS_HANDOFF]);
    expect(r.transferidasPorMotivo.every((f) => f.conversaciones === 0)).toBe(true);
  });

  it('solo bot cuenta en el denominador y no en el numerador; solo agente no cuenta', async () => {
    const soloBot = await crearHilo(tenant, null);
    await crearMensaje(tenant, soloBot, 'bot', EN_RANGO);
    await crearMensaje(tenant, soloBot, 'bot', EN_RANGO);
    const soloAgente = await crearHilo(tenant, null);
    await crearMensaje(tenant, soloAgente, 'agent', EN_RANGO);

    const r = await getHandoffRate(tid, query(), NOW);
    expect(r).toMatchObject({ conversacionesIa: 1, transferidas: 0, resueltasPorIa: 1, tasaEscalamiento: 0 });
  });

  it('un handoff en el rango cuenta; uno fuera del rango no', async () => {
    const dentro = await crearHilo(tenant, null);
    await crearMensaje(tenant, dentro, 'bot', EN_RANGO);
    await crearHandoff(tenant, dentro, EN_RANGO, 'keyword');
    const fuera = await crearHilo(tenant, null);
    await crearMensaje(tenant, fuera, 'bot', EN_RANGO);
    await crearHandoff(tenant, fuera, ANTES, 'keyword');

    const r = await getHandoffRate(tid, query(), NOW);
    expect(r).toMatchObject({ conversacionesIa: 2, transferidas: 1, resueltasPorIa: 1, tasaEscalamiento: 0.5 });
    expect(porMotivo(r, 'keyword')).toBe(1);
  });

  it('dos handoffs del mismo hilo: una conversación, dos eventos y el motivo del último', async () => {
    const hilo = await crearHilo(tenant, null);
    await crearMensaje(tenant, hilo, 'bot', EN_RANGO);
    await crearHandoff(tenant, hilo, EN_RANGO, 'explicit_request');
    await crearHandoff(tenant, hilo, MAS_TARDE, 'low_confidence');

    const r = await getHandoffRate(tid, query(), NOW);
    expect(r).toMatchObject({ conversacionesIa: 1, transferidas: 1, handoffsRegistrados: 2, tasaEscalamiento: 1 });
    expect(porMotivo(r, 'low_confidence')).toBe(1);
    expect(porMotivo(r, 'explicit_request')).toBe(0);
  });

  it('un handoff sin mensaje bot en el rango (aviso no enviado) cuenta en ambos: la tasa no pasa de 1', async () => {
    const hilo = await crearHilo(tenant, null);
    await crearMensaje(tenant, hilo, 'bot', ANTES);
    await crearHandoff(tenant, hilo, EN_RANGO);

    const r = await getHandoffRate(tid, query(), NOW);
    expect(r).toMatchObject({ conversacionesIa: 1, transferidas: 1, tasaEscalamiento: 1 });
  });

  it('un hilo devuelto a la IA sigue contando; apagar la IA a mano sin evento no cuenta', async () => {
    const devuelto = await crearHilo(tenant, null);
    await crearMensaje(tenant, devuelto, 'bot', EN_RANGO);
    await crearHandoff(tenant, devuelto, EN_RANGO);
    // Lo que deja `setIaHabilitada(true)`: el Cliente ya no recuerda el handoff.
    await Cliente.collection.updateOne(
      { _id: devuelto },
      { $set: { iaHabilitada: true }, $unset: { handoffAt: '', handoffMotivo: '' } },
    );

    const manual = await crearHilo(tenant, null);
    await crearMensaje(tenant, manual, 'bot', EN_RANGO);
    await Cliente.collection.updateOne({ _id: manual }, { $set: { iaHabilitada: false } });

    const r = await getHandoffRate(tid, query(), NOW);
    expect(r).toMatchObject({ conversacionesIa: 2, transferidas: 1 });
  });

  it('los hilos demo y los handoffs huérfanos (cliente inexistente) no cuentan', async () => {
    const demo = await crearHilo(tenant, null, { demo: true });
    await crearMensaje(tenant, demo, 'bot', EN_RANGO);
    await crearHandoff(tenant, demo, EN_RANGO);
    await crearHandoff(tenant, new Types.ObjectId(), EN_RANGO);

    const r = await getHandoffRate(tid, query(), NOW);
    expect(r).toMatchObject({ conversacionesIa: 0, transferidas: 0, handoffsRegistrados: 0 });
  });

  it('DoD: el porcentaje cuadra con los handoffs registrados en el periodo', async () => {
    const motivos = ['explicit_request', 'keyword', 'custom', 'intent_purchase', 'explicit_request'];
    for (const [i, m] of motivos.entries()) {
      const hilo = await crearHilo(tenant, null);
      await crearMensaje(tenant, hilo, 'bot', EN_RANGO);
      await crearHandoff(tenant, hilo, EN_RANGO, m);
      if (i === 0) await crearHandoff(tenant, hilo, MAS_TARDE, m); // vuelve a escalar
    }
    for (let i = 0; i < 7; i += 1) {
      const hilo = await crearHilo(tenant, null);
      await crearMensaje(tenant, hilo, 'bot', EN_RANGO);
    }

    // Conteo operativo calculado aparte: `entidadId` distintos de los handoffs del periodo.
    const eventos = await AuditEvent.collection
      .find({
        tenantId: tenant,
        accion: 'conversation.handoff',
        createdAt: { $gte: new Date('2026-09-01T00:00:00Z'), $lte: new Date('2026-09-30T23:59:59.999Z') },
      })
      .toArray();
    const distintas = new Set(eventos.map((e) => String(e['entidadId']))).size;

    const r = await getHandoffRate(tid, query(), NOW);
    expect(r.transferidas).toBe(distintas);
    expect(r.handoffsRegistrados).toBe(eventos.length);
    expect(r.conversacionesIa).toBe(12);
    expect(r.resueltasPorIa).toBe(r.conversacionesIa - r.transferidas);
    expect(r.tasaEscalamiento).toBe(Math.round((distintas / 12) * 10000) / 10000);
    expect(r.transferidasPorMotivo.reduce((s, f) => s + f.conversaciones, 0)).toBe(r.transferidas);
    expect(porMotivo(r, 'explicit_request')).toBe(2);
  });
});

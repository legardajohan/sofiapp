import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { getPeakHours } from './reports.service.js';
import { peakHoursQuerySchema, type PeakHoursQuery } from './reports.validation.js';
import type { IPeakHoursResponse } from './reports.types.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { crearHilo, crearMensaje } from './reports.fixtures.js';

const NOW = new Date('2026-10-09T12:00:00.000Z');
const SEPTIEMBRE = { desde: '2026-09-01', hasta: '2026-09-30' };

const query = (raw: Record<string, unknown> = {}): PeakHoursQuery =>
  peakHoursQuerySchema.parse({ query: { ...SEPTIEMBRE, ...raw } }).query;

const at = (iso: string): Date => new Date(iso);

const hora = (r: IPeakHoursResponse, h: number): IPeakHoursResponse['porHora'][number] => r.porHora[h]!;
const dia = (r: IPeakHoursResponse, fecha: string): IPeakHoursResponse['porDia'][number] | undefined =>
  r.porDia.find((d) => d.fecha === fecha);

/**
 * El DoD calculado APARTE: mensajes del tenant (cliente existente, no demo) en septiembre UTC,
 * contados por hora UTC con el driver, sin pasar por el pipeline del servicio.
 */
async function conteoIndependientePorHora(tenant: Types.ObjectId): Promise<number[]> {
  const clientes = await Cliente.collection.find({ tenantId: tenant }).toArray();
  const validos = new Set(clientes.filter((c) => !String(c['metaUserId']).startsWith('demo-')).map((c) => String(c._id)));
  const msgs = await Message.collection
    .find({ tenantId: tenant, createdAt: { $gte: at('2026-09-01T00:00:00Z'), $lte: at('2026-09-30T23:59:59.999Z') } })
    .toArray();
  const horas = Array.from({ length: 24 }, () => 0);
  for (const m of msgs) {
    if (!validos.has(String(m['clienteId']))) continue;
    const h = (m['createdAt'] as Date).getUTCHours();
    horas[h] = (horas[h] ?? 0) + 1;
  }
  return horas;
}

describe('HU-REP-04 — getPeakHours', () => {
  it('sin datos: 24 horas y todos los días en 0, sin pico', async () => {
    const r = await getPeakHours(new Types.ObjectId().toString(), query(), NOW);

    expect(r.timezone).toBe('UTC');
    expect(r.porHora.map((f) => f.hora)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(r.porDia).toHaveLength(30);
    expect(r.porDia[0]?.fecha).toBe('2026-09-01');
    expect(r.porDia.at(-1)?.fecha).toBe('2026-09-30');
    expect([...r.porHora, ...r.porDia].every((f) => f.total === 0)).toBe(true);
    expect(r).toMatchObject({ pico: null, diaPico: null, totales: { mensajes: 0, entrantes: 0, salientes: 0 } });
  });

  it('DoD: cada hora coincide con el conteo calculado aparte, y los totales cuadran', async () => {
    const tenant = new Types.ObjectId();
    const a = await crearHilo(tenant, null);
    const b = await crearHilo(tenant, null);
    for (const iso of ['2026-09-02T10:05:00Z', '2026-09-02T10:40:00Z', '2026-09-03T10:15:00Z', '2026-09-03T15:00:00Z']) {
      await crearMensaje(tenant, a, 'user', at(iso));
    }
    await crearMensaje(tenant, a, 'bot', at('2026-09-02T10:06:00Z'));
    await crearMensaje(tenant, b, 'user', at('2026-09-03T08:00:00Z'));
    await crearMensaje(tenant, b, 'agent', at('2026-09-03T08:30:00Z'));

    const r = await getPeakHours(tenant.toString(), query(), NOW);
    const aparte = await conteoIndependientePorHora(tenant);

    expect(r.porHora.map((f) => f.total)).toEqual(aparte);
    expect(hora(r, 10)).toEqual({ hora: 10, total: 4, entrantes: 3, salientes: 1 });
    expect(dia(r, '2026-09-03')).toEqual({ fecha: '2026-09-03', total: 4, entrantes: 3, salientes: 1 });
    expect(r.totales).toEqual({ mensajes: 7, entrantes: 5, salientes: 2 });
    const suma = (filas: Array<{ total: number }>): number => filas.reduce((s, f) => s + f.total, 0);
    expect(suma(r.porHora)).toBe(r.totales.mensajes);
    expect(suma(r.porDia)).toBe(r.totales.mensajes);
    expect([...r.porHora, ...r.porDia].every((f) => f.total === f.entrantes + f.salientes)).toBe(true);
    expect(r.pico).toEqual({ hora: 10, entrantes: 3 });
    expect(r.diaPico).toEqual({ fecha: '2026-09-03', entrantes: 3 });
  });

  it('empate: gana la hora más temprana y el primer día', async () => {
    const tenant = new Types.ObjectId();
    const c = await crearHilo(tenant, null);
    await crearMensaje(tenant, c, 'user', at('2026-09-05T16:00:00Z'));
    await crearMensaje(tenant, c, 'user', at('2026-09-04T09:00:00Z'));

    const r = await getPeakHours(tenant.toString(), query(), NOW);

    expect(r.pico).toEqual({ hora: 9, entrantes: 1 });
    expect(r.diaPico).toEqual({ fecha: '2026-09-04', entrantes: 1 });
  });

  it('fuera de rango, demo y huérfanos no cuentan', async () => {
    const tenant = new Types.ObjectId();
    const real = await crearHilo(tenant, null);
    const demo = await crearHilo(tenant, null, { demo: true });
    await crearMensaje(tenant, real, 'user', at('2026-09-10T12:00:00Z'));
    await crearMensaje(tenant, real, 'user', at('2026-08-31T23:59:00Z'));
    await crearMensaje(tenant, real, 'user', at('2026-10-01T00:00:00Z'));
    await crearMensaje(tenant, demo, 'user', at('2026-09-10T12:00:00Z'));
    await crearMensaje(tenant, new Types.ObjectId(), 'user', at('2026-09-10T12:00:00Z'));

    const r = await getPeakHours(tenant.toString(), query(), NOW);

    expect(r.totales.mensajes).toBe(1);
    expect(hora(r, 12).entrantes).toBe(1);
  });

  it('una ráfaga de plantillas salientes no mueve el pico de demanda', async () => {
    const tenant = new Types.ObjectId();
    const cliente = await crearHilo(tenant, null);
    await crearMensaje(tenant, cliente, 'user', at('2026-09-08T15:00:00Z'));
    await crearMensaje(tenant, cliente, 'user', at('2026-09-09T15:10:00Z'));
    for (let i = 0; i < 20; i += 1) {
      const destinatario = await crearHilo(tenant, null);
      await crearMensaje(tenant, destinatario, 'agent', at('2026-09-08T09:00:00Z'));
    }

    const r = await getPeakHours(tenant.toString(), query(), NOW);

    expect(hora(r, 9)).toMatchObject({ total: 20, entrantes: 0 });
    expect(r.pico).toEqual({ hora: 15, entrantes: 2 });
  });

  describe('zona horaria', () => {
    it('America/Bogota: 03:30Z cae a las 22 del día anterior y sale del rango que empieza ese día', async () => {
      const tenant = new Types.ObjectId();
      const c = await crearHilo(tenant, null);
      await crearMensaje(tenant, c, 'user', at('2026-09-01T03:30:00Z')); // 31-ago 22:30 en Bogotá
      await crearMensaje(tenant, c, 'user', at('2026-10-01T03:30:00Z')); // 30-sep 22:30 en Bogotá

      const bogota = await getPeakHours(tenant.toString(), query({ tz: 'America/Bogota' }), NOW);
      const utc = await getPeakHours(tenant.toString(), query(), NOW);

      expect(bogota.timezone).toBe('America/Bogota');
      expect(bogota.totales.entrantes).toBe(1);
      expect(hora(bogota, 22).entrantes).toBe(1);
      expect(dia(bogota, '2026-09-30')?.entrantes).toBe(1);
      expect(dia(bogota, '2026-09-01')?.entrantes).toBe(0);

      expect(utc.totales.entrantes).toBe(1);
      expect(hora(utc, 3).entrantes).toBe(1);
      expect(dia(utc, '2026-09-01')?.entrantes).toBe(1);
    });

    it('una zona de +14 h tampoco corta el último día', async () => {
      const tenant = new Types.ObjectId();
      const c = await crearHilo(tenant, null);
      await crearMensaje(tenant, c, 'user', at('2026-08-31T10:30:00Z')); // 1-sep 00:30 en Kiritimati

      const r = await getPeakHours(tenant.toString(), query({ tz: 'Pacific/Kiritimati' }), NOW);

      expect(dia(r, '2026-09-01')?.entrantes).toBe(1);
      expect(hora(r, 0).entrantes).toBe(1);
    });
  });

  it('sin query: rango de 30 días hasta hoy en UTC', async () => {
    const r = await getPeakHours(new Types.ObjectId().toString(), peakHoursQuerySchema.parse({ query: {} }).query, NOW);

    expect(r.porDia).toHaveLength(30);
    expect(r.porDia.at(-1)?.fecha).toBe('2026-10-09');
    expect(r.timezone).toBe('UTC');
  });
});

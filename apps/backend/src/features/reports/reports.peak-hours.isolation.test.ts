import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import app from '../../app.js';
import { crearHilo, crearMensaje } from './reports.fixtures.js';
import type { IPeakHoursResponse } from './reports.types.js';

/*
 * Invariante multi-tenant de HU-REP-04 (docs/multi-tenancy.md §8): las horas de A solo cuentan
 * mensajes de A, aunque B tenga mensajes que apuntan a un cliente de A, y el tenant nunca sale de la
 * query.
 */

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const QS = '?desde=2026-09-01&hasta=2026-09-30';

const tokenDe = (tenantId: Types.ObjectId): string =>
  jwt.sign(
    { sub: new Types.ObjectId().toString(), tenantId: tenantId.toString(), email: 'g@x.com', nombre: 'G', rol: 'admin', subrol: 'manager', activo: true },
    SECRET,
    { expiresIn: '1h' },
  );

describe('HU-REP-04 — aislamiento de horas pico', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  beforeEach(async () => {
    const hiloA = await crearHilo(tenantA, null);
    await crearMensaje(tenantA, hiloA, 'user', new Date('2026-09-15T10:00:00Z'));

    // B escribe más, a otra hora, y además un mensaje que apunta al cliente de A.
    for (let i = 0; i < 3; i += 1) {
      const hiloB = await crearHilo(tenantB, null);
      await crearMensaje(tenantB, hiloB, 'user', new Date('2026-09-15T18:00:00Z'));
    }
    await crearMensaje(tenantB, hiloA, 'user', new Date('2026-09-15T10:30:00Z'));
  });

  async function horas(tenant: Types.ObjectId, qs = QS): Promise<{ body: IPeakHoursResponse; raw: string }> {
    const res = await request(app).get(`/api/reports/peak-hours${qs}`).set('Cookie', `token=${tokenDe(tenant)}`);
    expect(res.status).toBe(200);
    return { body: res.body as IPeakHoursResponse, raw: res.text };
  }

  it('las horas de A solo cuentan mensajes de A', async () => {
    const { body } = await horas(tenantA);
    expect(body.totales.mensajes).toBe(1);
    expect(body.pico).toEqual({ hora: 10, entrantes: 1 });
    expect(body.porHora[18]?.total).toBe(0);
  });

  it('en B, el mensaje que apunta a un cliente de A no cuenta', async () => {
    const { body } = await horas(tenantB);
    expect(body.totales.mensajes).toBe(3);
    expect(body.porHora[10]?.total).toBe(0);
  });

  it('un tenantId en la query se ignora', async () => {
    const { body } = await horas(tenantA, `${QS}&tenantId=${tenantB.toString()}`);
    expect(body.totales.mensajes).toBe(1);
  });

  it('la respuesta no lleva PII de contactos ni textos', async () => {
    const { raw } = await horas(tenantA);
    for (const pii of ['573009', 'Contacto secreto', 'Texto privado', 'wa_', 'metaUserId', 'clienteId']) {
      expect(raw).not.toContain(pii);
    }
  });
});

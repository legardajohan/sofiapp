import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import app from '../../app.js';
import { crearHandoff, crearHilo, crearMensaje } from './reports.fixtures.js';
import type { IHandoffRateResponse } from './reports.types.js';

/*
 * Invariante multi-tenant de HU-REP-02 (docs/multi-tenancy.md §8): la tasa de A solo cuenta lo de A,
 * aunque B tenga mensajes y handoffs que apuntan a un cliente de A, y el tenant nunca sale de la query.
 */

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EN_RANGO = new Date('2026-09-20T10:00:00Z');
const QS = '?desde=2026-09-01&hasta=2026-09-30';

const tokenDe = (tenantId: Types.ObjectId): string =>
  jwt.sign(
    { sub: new Types.ObjectId().toString(), tenantId: tenantId.toString(), email: 'g@x.com', nombre: 'G', rol: 'admin', subrol: 'manager', activo: true },
    SECRET,
    { expiresIn: '1h' },
  );

describe('HU-REP-02 — aislamiento de la tasa de escalamiento', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  beforeEach(async () => {
    const transferidoA = await crearHilo(tenantA, null);
    await crearMensaje(tenantA, transferidoA, 'bot', EN_RANGO);
    await crearHandoff(tenantA, transferidoA, EN_RANGO, 'custom', 'Condición secreta');
    const resueltoA = await crearHilo(tenantA, null);
    await crearMensaje(tenantA, resueltoA, 'bot', EN_RANGO);

    // B tiene más volumen y además apunta a un cliente de A en sus propios mensajes y handoffs.
    for (let i = 0; i < 4; i += 1) {
      const hiloB = await crearHilo(tenantB, null);
      await crearMensaje(tenantB, hiloB, 'bot', EN_RANGO);
      await crearHandoff(tenantB, hiloB, EN_RANGO);
    }
    await crearMensaje(tenantB, resueltoA, 'bot', EN_RANGO);
    await crearHandoff(tenantB, resueltoA, EN_RANGO);
  });

  async function tasa(tenant: Types.ObjectId, qs = QS): Promise<{ body: IHandoffRateResponse; raw: string }> {
    const res = await request(app).get(`/api/reports/handoff-rate${qs}`).set('Cookie', `token=${tokenDe(tenant)}`);
    expect(res.status).toBe(200);
    return { body: res.body as IHandoffRateResponse, raw: res.text };
  }

  it('la tasa de A solo cuenta datos de A', async () => {
    const { body } = await tasa(tenantA);
    expect(body).toMatchObject({ conversacionesIa: 2, transferidas: 1, handoffsRegistrados: 1, tasaEscalamiento: 0.5 });
  });

  it('en B, los datos que apuntan a un cliente de A no cuentan', async () => {
    const { body } = await tasa(tenantB);
    expect(body).toMatchObject({ conversacionesIa: 4, transferidas: 4, handoffsRegistrados: 4 });
  });

  it('un tenantId en la query se ignora', async () => {
    const { body } = await tasa(tenantA, `${QS}&tenantId=${tenantB.toString()}`);
    expect(body).toMatchObject({ conversacionesIa: 2, transferidas: 1 });
  });

  it('la respuesta no lleva PII de contactos, textos ni nombres de condición', async () => {
    const { raw } = await tasa(tenantA);
    for (const pii of ['573009', 'Contacto secreto', 'Texto privado', 'Condición secreta', 'wa_']) {
      expect(raw).not.toContain(pii);
    }
  });
});

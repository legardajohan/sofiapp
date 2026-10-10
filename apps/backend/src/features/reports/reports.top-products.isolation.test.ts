import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import app from '../../app.js';
import { clasificarHilo, crearHilo, crearMensaje, crearProductosKb } from './reports.fixtures.js';
import type { ITopProductsResponse } from './reports.types.js';

/*
 * Invariante multi-tenant de HU-REP-03 (docs/multi-tenancy.md §8): el ranking de A solo cuenta lo
 * de A, aunque B tenga mensajes que apuntan a un cliente de A, y el tenant nunca sale de la query.
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

describe('HU-REP-03 — aislamiento de productos más consultados', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  beforeEach(async () => {
    await crearProductosKb(tenantA, ['Producto de A']);
    const hiloA = await crearHilo(tenantA, null);
    await crearMensaje(tenantA, hiloA, 'user', EN_RANGO);
    await clasificarHilo(tenantA, hiloA, 'Producto de A');

    // B tiene más volumen, su propio catálogo, y además un mensaje que apunta a un cliente de A.
    await crearProductosKb(tenantB, ['Producto de B']);
    for (let i = 0; i < 3; i += 1) {
      const hiloB = await crearHilo(tenantB, null);
      await crearMensaje(tenantB, hiloB, 'user', EN_RANGO);
      await clasificarHilo(tenantB, hiloB, 'Producto de B');
    }
    await crearMensaje(tenantB, hiloA, 'user', EN_RANGO);
  });

  async function ranking(tenant: Types.ObjectId, qs = QS): Promise<{ body: ITopProductsResponse; raw: string }> {
    const res = await request(app).get(`/api/reports/top-products${qs}`).set('Cookie', `token=${tokenDe(tenant)}`);
    expect(res.status).toBe(200);
    return { body: res.body as ITopProductsResponse, raw: res.text };
  }

  it('el ranking de A solo cuenta datos de A', async () => {
    const { body } = await ranking(tenantA);
    expect(body).toMatchObject({ totalConsultas: 1, clasificadas: 1 });
    expect(body.ranking.map((f) => f.nombre)).toEqual(['Producto de A']);
  });

  it('en B, el mensaje que apunta a un cliente de A no cuenta', async () => {
    const { body } = await ranking(tenantB);
    expect(body).toMatchObject({ totalConsultas: 3, clasificadas: 3 });
    expect(body.ranking.map((f) => f.nombre)).toEqual(['Producto de B']);
  });

  it('un tenantId en la query se ignora', async () => {
    const { body } = await ranking(tenantA, `${QS}&tenantId=${tenantB.toString()}`);
    expect(body.totalConsultas).toBe(1);
    expect(body.ranking.map((f) => f.nombre)).toEqual(['Producto de A']);
  });

  it('la respuesta no lleva PII de contactos ni textos', async () => {
    const { raw } = await ranking(tenantA);
    for (const pii of ['573009', 'Contacto secreto', 'Texto privado', 'wa_', 'telefono', 'metaUserId']) {
      expect(raw).not.toContain(pii);
    }
  });
});

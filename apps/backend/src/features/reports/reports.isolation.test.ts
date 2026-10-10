import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import app from '../../app.js';
import { crearAsesor, crearHilo, crearLead, crearMensaje } from './reports.fixtures.js';
import type { IAdvisorReportResponse } from './reports.types.js';

/*
 * Invariante multi-tenant de HU-REP-01 (docs/multi-tenancy.md §8): el reporte de A solo cuenta lo
 * de A, aunque B use ids de usuarios de A como asesor/responsable, y el tenant nunca sale de la query.
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

describe('HU-REP-01 — aislamiento del reporte por asesor', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();
  let lauraA: Types.ObjectId;

  beforeEach(async () => {
    lauraA = await crearAsesor(tenantA, 'Laura A');
    const hiloA = await crearHilo(tenantA, lauraA, { ultimoMensajeAt: EN_RANGO });
    await crearMensaje(tenantA, hiloA, 'agent', EN_RANGO);
    await crearLead(tenantA, lauraA, 'pagado', [{ a: 'pagado', at: EN_RANGO }]);

    // B tiene más volumen y además "apunta" a la asesora de A en sus propios datos.
    await crearAsesor(tenantB, 'Mario B');
    for (let i = 0; i < 4; i += 1) {
      const hiloB = await crearHilo(tenantB, lauraA, { ultimoMensajeAt: EN_RANGO });
      await crearMensaje(tenantB, hiloB, 'agent', EN_RANGO);
      await crearLead(tenantB, lauraA, 'pagado', [{ a: 'pagado', at: EN_RANGO }]);
    }
  });

  async function reporte(tenant: Types.ObjectId, qs = QS): Promise<{ body: IAdvisorReportResponse; raw: string }> {
    const res = await request(app).get(`/api/reports/by-advisor${qs}`).set('Cookie', `token=${tokenDe(tenant)}`);
    expect(res.status).toBe(200);
    return { body: res.body as IAdvisorReportResponse, raw: res.text };
  }

  it('el reporte de A solo cuenta datos de A', async () => {
    const { body } = await reporte(tenantA);
    expect(body.porAsesor.map((f) => f.nombre)).toEqual(['Laura A']);
    expect(body.porAsesor[0]).toMatchObject({ conversacionesAtendidas: 1, ventas: 1 });
    expect(body.totales).toMatchObject({ conversacionesAtendidas: 1, ventas: 1 });
    expect(body.sinAsignar).toEqual({ conversacionesAtendidas: 0, ventas: 0 });
  });

  it('en B, los datos que apuntan a la asesora de A van a "sin asignar", nunca a ella', async () => {
    const { body } = await reporte(tenantB);
    expect(body.porAsesor.map((f) => f.nombre)).toEqual(['Mario B']);
    expect(body.sinAsignar).toEqual({ conversacionesAtendidas: 4, ventas: 4 });
  });

  it('un tenantId en la query se ignora', async () => {
    const { body } = await reporte(tenantA, `${QS}&tenantId=${tenantB.toString()}`);
    expect(body.totales).toMatchObject({ conversacionesAtendidas: 1, ventas: 1 });
  });

  it('la respuesta no lleva PII de contactos ni textos', async () => {
    const { raw } = await reporte(tenantA);
    for (const pii of ['573009', '573118', 'Contacto secreto', 'Lead secreto', 'Texto privado', '@pii.test']) {
      expect(raw).not.toContain(pii);
    }
  });
});

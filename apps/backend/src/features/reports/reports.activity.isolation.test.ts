import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import app from '../../app.js';
import { crearAsesor } from './reports.fixtures.js';
import { ActividadAsesor } from '../activity/activity.model.js';
import type { IAdvisorActivityResponse, IAdvisorReportResponse } from './reports.types.js';

/*
 * Invariante multi-tenant de HU-REP-06 (docs/multi-tenancy.md §8): el tiempo activo de A nunca
 * aparece en un reporte de B, tampoco pidiendo por el `asesorId` de A.
 */

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const QS = '?desde=2026-09-01&hasta=2026-09-30';

const tokenDe = (tenantId: Types.ObjectId): string =>
  jwt.sign(
    { sub: new Types.ObjectId().toString(), tenantId: tenantId.toString(), rol: 'admin', subrol: 'manager' },
    SECRET,
    { expiresIn: '1h' },
  );

describe('HU-REP-06 — aislamiento del tiempo activo', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();
  let asesorA: Types.ObjectId;

  beforeEach(async () => {
    asesorA = await crearAsesor(tenantA, 'Ana');
    await crearAsesor(tenantB, 'Beto');
    const hora = new Date('2026-09-15T10:00:00Z');
    await ActividadAsesor.collection.insertOne({
      tenantId: tenantA,
      userId: asesorA,
      hora,
      segundosActivos: 3600,
      primerLatido: hora,
      ultimoLatido: hora,
    });
  });

  it('by-advisor de B no ve los segundos de A', async () => {
    const res = await request(app).get(`/api/reports/by-advisor${QS}`).set('Cookie', `token=${tokenDe(tenantB)}`);
    const body = res.body as IAdvisorReportResponse;
    expect(body.totales.segundosActivos).toBe(0);
    expect(body.porAsesor.every((f) => f.segundosActivos === 0)).toBe(true);
  });

  it('advisor-activity de B está vacío, y A sí ve lo suyo', async () => {
    const deB = await request(app).get(`/api/reports/advisor-activity${QS}`).set('Cookie', `token=${tokenDe(tenantB)}`);
    const b = deB.body as IAdvisorActivityResponse;
    expect(b.asesores).toEqual([]);
    expect(b.periodos.every((p) => p.totalSegundos === 0)).toBe(true);

    const deA = await request(app).get(`/api/reports/advisor-activity${QS}`).set('Cookie', `token=${tokenDe(tenantA)}`);
    expect((deA.body as IAdvisorActivityResponse).asesores.map((a) => a.nombre)).toEqual(['Ana']);
  });

  it('B pidiendo el asesorId de A recibe una serie vacía', async () => {
    const res = await request(app)
      .get(`/api/reports/advisor-activity${QS}&asesorId=${asesorA.toString()}`)
      .set('Cookie', `token=${tokenDe(tenantB)}`);
    expect(res.status).toBe(200);
    const body = res.body as IAdvisorActivityResponse;
    expect(body.asesores).toEqual([]);
    expect(body.periodos.every((p) => p.totalSegundos === 0 && p.porAsesor.length === 0)).toBe(true);
  });
});

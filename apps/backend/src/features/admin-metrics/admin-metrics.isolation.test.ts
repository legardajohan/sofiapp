import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import app from '../../app.js';
import { crearTenant, sembrar } from './admin-metrics.fixtures.js';
import type { IGlobalMetricsResponse, ITenantMetricsRow } from './admin-metrics.types.js';

/*
 * Invariante multi-tenant de HU-SAAS-03 (docs/multi-tenancy.md §5.3 y §8): el endpoint global es
 * cross-tenant por diseño, pero cada fila cuenta SOLO lo de su tenant, la respuesta no lleva PII y
 * ningún rol distinto de superadmin entra.
 */

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const URL = '/api/admin/metrics/global?limit=100';

const token = (rol: 'superadmin' | 'admin', tenantId: string | null): string =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439011', tenantId, email: 'x@x.com', nombre: 'X', rol, activo: true },
    SECRET,
    { expiresIn: '1h' }
  );

describe('HU-SAAS-03 — aislamiento del tablero global', () => {
  let tenantA: Types.ObjectId;
  let tenantB: Types.ObjectId;

  beforeEach(async () => {
    tenantA = await crearTenant('Empresa A');
    tenantB = await crearTenant('Empresa B');
    // Volúmenes distintos en TODAS las métricas para que un cruce se note.
    await sembrar(tenantA, '111', { usuarios: 2, clientes: 3, mensajesIn: 5, mensajesOut: 1, leads: 4, ventas: 1, campanas: 1 });
    await sembrar(tenantB, '222', { usuarios: 6, clientes: 8, mensajesIn: 2, mensajesOut: 9, leads: 7, ventas: 3, campanas: 4 });
  });

  async function filas(): Promise<{ body: IGlobalMetricsResponse; raw: string; a: ITenantMetricsRow; b: ITenantMetricsRow }> {
    const res = await request(app).get(URL).set('Cookie', `token=${token('superadmin', null)}`);
    expect(res.status).toBe(200);
    const body = res.body as IGlobalMetricsResponse;
    const a = body.porEmpresa.items.find((f) => f.tenantId === String(tenantA));
    const b = body.porEmpresa.items.find((f) => f.tenantId === String(tenantB));
    if (!a || !b) throw new Error('faltan filas de A o B');
    return { body, raw: res.text, a, b };
  }

  it('la fila de cada tenant cuenta solo sus propios documentos', async () => {
    const { a, b } = await filas();
    expect(a).toMatchObject({ usuarios: 2, conversaciones: 3, mensajes: 6, leads: 4, ventas: 1, campanas: 1 });
    expect(b).toMatchObject({ usuarios: 6, conversaciones: 8, mensajes: 11, leads: 7, ventas: 3, campanas: 4 });
  });

  it('la respuesta solo lleva conteos: sin teléfonos, nombres de contacto, emails ni textos', async () => {
    const { raw } = await filas();
    for (const pii of ['57300111', '57311222', 'Contacto 111', 'Lead 222', 'Mensaje secreto', '@pii.test', 'Usuario 111', 'passwordHash']) {
      expect(raw).not.toContain(pii);
    }
  });

  it('un admin de un tenant no accede (ni a su propia fila) → 403', async () => {
    const res = await request(app).get(URL).set('Cookie', `token=${token('admin', String(tenantA))}`);
    expect(res.status).toBe(403);
  });
});

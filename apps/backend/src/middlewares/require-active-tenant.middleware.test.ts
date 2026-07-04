import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { TenantModel } from '../features/tenant/tenant.model.js';
import { requireActiveTenant } from './require-active-tenant.middleware.js';

const mockRes = () => {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
};

describe('requireActiveTenant middleware (HU-SAAS-01)', () => {
  it('tenant con estado suspendido → responde 403', async () => {
    const tenant = await TenantModel.create({
      nombre: 'Suspendida',
      slug: 'suspendida',
      contacto: { email: 's@s.com', telefono: '3000000001' },
      estado: 'suspendido',
    });

    const req = { user: { tenantId: tenant._id } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveTenant(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('tenant con estado prueba → responde 403', async () => {
    const tenant = await TenantModel.create({
      nombre: 'En Prueba',
      slug: 'en-prueba',
      contacto: { email: 'p@p.com', telefono: '3000000002' },
      estado: 'prueba',
    });

    const req = { user: { tenantId: tenant._id } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveTenant(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('tenant con estado activo → llama next()', async () => {
    const tenant = await TenantModel.create({
      nombre: 'Activa',
      slug: 'activa',
      contacto: { email: 'a@a.com', telefono: '3000000003' },
      estado: 'activo',
    });

    const req = { user: { tenantId: tenant._id } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveTenant(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('tenant inexistente → responde 403', async () => {
    const req = { user: { tenantId: new Types.ObjectId() } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireActiveTenant(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

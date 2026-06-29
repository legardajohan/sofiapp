import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireTenant } from './require-tenant.middleware.js';

const mockRes = () => {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
};

describe('requireTenant middleware (INF-02)', () => {
  it('sin req.user.tenantId → responde 500', () => {
    const req = { user: { tenantId: null } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('sin req.user → responde 500', () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('con tenantId → llama next()', () => {
    const req = {
      user: { tenantId: new Types.ObjectId() },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

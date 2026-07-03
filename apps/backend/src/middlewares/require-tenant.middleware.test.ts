import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireTenant } from './require-tenant.middleware.js';

<<<<<<< HEAD
const mockRes = () => {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
};

describe('requireTenant middleware (INF-02)', () => {
  it('sin req.user.tenantId → responde 500', () => {
    const req = { user: { tenantId: null } } as unknown as Request;
    const res = mockRes();
=======
function makeReq(user?: Partial<Request['user']>): Request {
  return { user } as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

describe('requireTenant', () => {
  it('devuelve 500 si req.user está ausente', () => {
    const req = makeReq(undefined);
    const { res, status, json } = makeRes();
>>>>>>> develop
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

<<<<<<< HEAD
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('sin req.user → responde 500', () => {
    const req = {} as Request;
    const res = mockRes();
=======
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('corrupta') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 500 si req.user.tenantId es null', () => {
    const req = makeReq({ tenantId: null });
    const { res, status, json } = makeRes();
>>>>>>> develop
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

<<<<<<< HEAD
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('con tenantId → llama next()', () => {
    const req = {
      user: { tenantId: new Types.ObjectId() },
    } as unknown as Request;
    const res = mockRes();
=======
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('llama next() cuando tenantId está presente', () => {
    const req = makeReq({ tenantId: new Types.ObjectId() });
    const { res } = makeRes();
>>>>>>> develop
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

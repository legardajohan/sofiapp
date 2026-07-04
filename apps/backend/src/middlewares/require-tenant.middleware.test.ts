import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireTenant } from './require-tenant.middleware.js';

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
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('corrupta') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 500 si req.user.tenantId es null', () => {
    const req = makeReq({ tenantId: null });
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('llama next() cuando tenantId está presente', () => {
    const req = makeReq({ tenantId: new Types.ObjectId() });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    requireTenant(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

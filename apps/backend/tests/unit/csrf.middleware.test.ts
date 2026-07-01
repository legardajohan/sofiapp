import type { Request, Response, NextFunction } from 'express';
import { describe, it, expect, vi } from 'vitest';
import { csrfGuard } from '../../src/middlewares/csrf.middleware.js';

function buildReq(opts: { method: string; path: string; header?: string; cookie?: string }): Request {
  return {
    method: opts.method,
    path: opts.path,
    cookies: opts.cookie ? { csrfToken: opts.cookie } : {},
    get: (name: string) => (name === 'X-CSRF-Token' ? opts.header : undefined),
  } as unknown as Request;
}

function buildRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = vi.fn().mockReturnValue(res) as unknown as Response['json'];
  return res;
}

describe('csrfGuard', () => {
  it('POST sin header ni cookie → 403', () => {
    const req = buildReq({ method: 'POST', path: '/api/clientes' });
    const res = buildRes();
    const next = vi.fn();

    csrfGuard(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('POST con header distinto a la cookie → 403', () => {
    const req = buildReq({ method: 'POST', path: '/api/clientes', header: 'abc', cookie: 'xyz' });
    const res = buildRes();
    const next = vi.fn();

    csrfGuard(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('POST con header === cookie → next()', () => {
    const req = buildReq({ method: 'POST', path: '/api/clientes', header: 'match-token', cookie: 'match-token' });
    const res = buildRes();
    const next = vi.fn();

    csrfGuard(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('GET está exento (métodos seguros)', () => {
    const req = buildReq({ method: 'GET', path: '/api/clientes' });
    const res = buildRes();
    const next = vi.fn();

    csrfGuard(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it('POST /api/auth/login está exento (ruta pública)', () => {
    const req = buildReq({ method: 'POST', path: '/api/auth/login' });
    const res = buildRes();
    const next = vi.fn();

    csrfGuard(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it('POST /api/webhooks/* está exento (ruta pública)', () => {
    const req = buildReq({ method: 'POST', path: '/api/webhooks/whatsapp' });
    const res = buildRes();
    const next = vi.fn();

    csrfGuard(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });
});

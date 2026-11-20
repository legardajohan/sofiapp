import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from './security-headers.middleware.js';

function appMinima(): express.Express {
  const app = express();
  app.use(securityHeaders);
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('securityHeaders', () => {
  it('cumple las cabeceras del CA 2', async () => {
    const res = await request(appMinima()).get('/ping');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();

    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");

    const hsts = String(res.headers['strict-transport-security']);
    expect(hsts).toContain('max-age=15552000');
    expect(hsts).not.toContain('includeSubDomains');
    expect(hsts).not.toContain('preload');
  });
});

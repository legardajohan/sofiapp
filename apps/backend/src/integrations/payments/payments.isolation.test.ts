import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createWompiProvider } from './wompi.provider.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

describe('integrations/payments no conoce tenants ni Mongo', () => {
  const fuentes = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('hay fuentes que revisar', () => {
    expect(fuentes.length).toBeGreaterThan(5);
  });

  it.each(fuentes)('%s: sin mongoose, modelos, repositorio base ni tenant', (archivo) => {
    const src = readFileSync(path.join(DIR, archivo), 'utf8');
    expect(src).not.toMatch(/from ['"]mongoose['"]/);
    expect(src).not.toMatch(/\.model(\.js)?['"]/);
    expect(src).not.toMatch(/repositories\/base\.repository/);
    expect(src.toLowerCase()).not.toContain('tenantid');
  });

  it('crearIntento devuelve la misma forma para dos referencias distintas', async () => {
    const p = createWompiProvider({
      env: 'sandbox',
      publicKey: 'pub_test_x',
      privateKey: 'prv_test_x',
      eventsSecret: 'test_events_x',
      integritySecret: 'test_integrity_x',
      redirectUrl: 'https://app.test/pago',
      timeoutMs: 1000,
    });
    const expiraEn = new Date(Date.now() + 3_600_000);
    const a = await p.crearIntento({ reference: 'SOFI-AAAAAAAAAAAAAAAAAAAAAAAA', amountInCents: 1000, expiraEn });
    const b = await p.crearIntento({ reference: 'SOFI-BBBBBBBBBBBBBBBBBBBBBBBB', amountInCents: 1000, expiraEn });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(JSON.stringify(a).toLowerCase()).not.toContain('tenant');
  });
});

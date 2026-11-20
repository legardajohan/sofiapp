import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { escanear } from '../../scripts/check-bundle-secrets.mjs';

// HT-PAY-05 (CA 13): un secreto de Wompi en el bundle o una VITE_* con nombre de secreto rompe el
// build. Los hallazgos dicen dónde y qué patrón, nunca el texto encontrado.

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/check-bundle-secrets.mjs',
);

let raiz: string;
let dist: string;

beforeEach(() => {
  raiz = mkdtempSync(path.join(os.tmpdir(), 'sofiapp-bundle-'));
  dist = path.join(raiz, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

const bundle = (contenido: string, nombre = 'assets/index-abc.js'): void => {
  writeFileSync(path.join(dist, nombre), contenido);
};

describe('escanear', () => {
  it.each([
    ['prv_test_abcdef', 'llave privada'],
    ['test_events_xyz', 'secreto de eventos'],
    ['prod_integrity_xyz', 'secreto de integridad'],
  ])('un .js con %s (%s) → hallazgo de tipo bundle', (secreto) => {
    bundle(`const k="${secreto}";`);
    const h = escanear({ dist, env: {} });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ tipo: 'bundle', ubicacion: 'assets/index-abc.js' });
  });

  it('una llave pública (pub_test_…) no es hallazgo', () => {
    bundle('const k="pub_test_abcdef";');
    expect(escanear({ dist, env: {} })).toEqual([]);
  });

  it('también revisa .css, .html y .map', () => {
    bundle('x{content:"prv_prod_zz"}', 'assets/a.css');
    bundle('<!-- test_events_q -->', 'index.html');
    bundle('{"sourcesContent":["prod_integrity_q"]}', 'assets/a.js.map');
    expect(escanear({ dist, env: {} })).toHaveLength(3);
  });

  it.each(['VITE_WOMPI_PRIVATE_KEY', 'VITE_INTEGRITY_SECRET', 'VITE_WOMPI_EVENTS_KEY'])(
    '%s → hallazgo de tipo variable',
    (nombre) => {
      const h = escanear({ dist, env: { [nombre]: 'x' } });
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ tipo: 'variable', ubicacion: nombre });
    },
  );

  it('VITE_WOMPI_PUBLIC_KEY y variables no VITE_ no son hallazgo', () => {
    expect(
      escanear({ dist, env: { VITE_WOMPI_PUBLIC_KEY: 'pub_test_x', WOMPI_PRIVATE_KEY: 'prv_test_x' } }),
    ).toEqual([]);
  });

  it('ningún hallazgo contiene el texto del secreto', () => {
    bundle('const k="prv_test_VALOR_SENSIBLE_99";');
    const h = escanear({ dist, env: { VITE_X_SECRET: 'VALOR_SENSIBLE_99' } });
    expect(h.length).toBeGreaterThan(0);
    expect(JSON.stringify(h)).not.toContain('VALOR_SENSIBLE_99');
  });

  it('sin carpeta dist no lanza', () => {
    expect(escanear({ dist: path.join(raiz, 'no-existe'), env: {} })).toEqual([]);
  });
});

describe('CLI', () => {
  const correr = (env: Record<string, string>) =>
    spawnSync(process.execPath, [SCRIPT], {
      cwd: raiz,
      env: { PATH: process.env['PATH'] ?? '', ...env },
      encoding: 'utf8',
    });

  it('sale con 1 ante hallazgos y no imprime el secreto', () => {
    bundle('const k="prv_test_VALOR_SENSIBLE_99";');
    const r = correr({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/index-abc.js');
    expect(r.stdout + r.stderr).not.toContain('VALOR_SENSIBLE_99');
  });

  it('sale con 1 ante una variable VITE_ prohibida sin imprimir su valor', () => {
    bundle('const k=1;');
    const r = correr({ VITE_WOMPI_PRIVATE_KEY: 'VALOR_SENSIBLE_99' });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toContain('VALOR_SENSIBLE_99');
  });

  it('sale con 0 sin hallazgos (con llave pública)', () => {
    bundle('const k="pub_test_abc";');
    expect(correr({ VITE_WOMPI_PUBLIC_KEY: 'pub_test_abc' }).status).toBe(0);
  });
});

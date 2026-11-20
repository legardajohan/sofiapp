import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// HT-PAY-05 (CA 12): la CSP y las cabeceras del SPA, directiva por directiva. Se publica en modo
// bloqueo (sin Report-Only), así que este test es la red de seguridad contra un cambio accidental.

interface Cabecera {
  key: string;
  value: string;
}
interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: Cabecera[] }[];
}

const RUTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../vercel.json');
const config = JSON.parse(readFileSync(RUTA, 'utf8')) as VercelConfig;
const cabeceras = config.headers.flatMap((h) => h.headers);
const valor = (nombre: string): string | undefined =>
  cabeceras.find((c) => c.key.toLowerCase() === nombre.toLowerCase())?.value;

const csp = valor('Content-Security-Policy') ?? '';
const directivas = new Map<string, string[]>(
  csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [nombre = '', ...fuentes] = d.split(/\s+/);
      return [nombre, fuentes] as [string, string[]];
    }),
);
const fuentes = (d: string): string[] => directivas.get(d) ?? [];

// El origen del API se extrae del propio archivo: si el dominio real no es sofiapp.co, se cambia
// en un solo sitio (vercel.json y 00-deploy.md).
const API_HTTPS = fuentes('connect-src').find((f) => f.startsWith('https://') && !f.includes('*') && f.split('.').length === 3 && f.includes('api.')) ?? '';
const API_WSS = API_HTTPS.replace('https://', 'wss://');

describe('vercel.json', () => {
  it('tiene el rewrite SPA', () => {
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('el origen del API se identifica y aparece con https y wss', () => {
    expect(API_HTTPS).toMatch(/^https:\/\/api\./);
    expect(fuentes('connect-src')).toContain(API_WSS);
  });

  it('cabeceras de seguridad', () => {
    expect(valor('X-Content-Type-Options')).toBe('nosniff');
    expect(valor('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(valor('X-Frame-Options')).toBe('DENY');
    const permisos = valor('Permissions-Policy') ?? '';
    expect(permisos).toContain('microphone=(self)');
    expect(permisos).toContain('camera=()');
    expect(permisos).toContain('geolocation=()');
  });

  it('no define Cross-Origin-Opener-Policy ni Cross-Origin-Embedder-Policy', () => {
    // El popup de Embedded Signup de Facebook necesita conservar `window.opener`.
    expect(valor('Cross-Origin-Opener-Policy')).toBeUndefined();
    expect(valor('Cross-Origin-Embedder-Policy')).toBeUndefined();
  });

  it('la CSP va en bloqueo (no Report-Only)', () => {
    expect(valor('Content-Security-Policy-Report-Only')).toBeUndefined();
    expect(csp).not.toBe('');
  });
});

describe('CSP', () => {
  it('script-src: solo self, Wompi y el SDK de Facebook; sin unsafe-inline ni unsafe-eval', () => {
    expect(fuentes('script-src').sort()).toEqual(
      ["'self'", 'https://checkout.wompi.co', 'https://connect.facebook.net'].sort(),
    );
    expect(csp).not.toContain("'unsafe-eval'");
    expect(fuentes('script-src')).not.toContain("'unsafe-inline'");
  });

  it("el único 'unsafe-inline' es el de style-src", () => {
    const conInline = [...directivas.entries()].filter(([, f]) => f.includes("'unsafe-inline'"));
    expect(conInline.map(([d]) => d)).toEqual(['style-src']);
  });

  it('frame-src: solo Wompi y los frames de Facebook', () => {
    expect(fuentes('frame-src').sort()).toEqual(
      ['https://checkout.wompi.co', 'https://web.facebook.com', 'https://www.facebook.com'].sort(),
    );
  });

  it('connect-src: self, API (https y wss), Wompi, Facebook y jsdelivr', () => {
    expect(fuentes('connect-src').sort()).toEqual(
      [
        "'self'",
        API_HTTPS,
        API_WSS,
        'https://*.wompi.co',
        'https://graph.facebook.com',
        'https://www.facebook.com',
        'https://cdn.jsdelivr.net',
      ].sort(),
    );
  });

  it('img-src y media-src: self, data/blob, API y Spaces', () => {
    for (const d of ['img-src', 'media-src']) {
      expect(fuentes(d)).toEqual(expect.arrayContaining(["'self'", 'blob:', API_HTTPS, 'https://*.digitaloceanspaces.com']));
    }
    expect(fuentes('img-src')).toContain('data:');
  });

  it('object-src none, base-uri self, frame-ancestors none', () => {
    expect(fuentes('object-src')).toEqual(["'none'"]);
    expect(fuentes('base-uri')).toEqual(["'self'"]);
    expect(fuentes('frame-ancestors')).toEqual(["'none'"]);
  });

  it('form-action: solo self y el Web Checkout de Wompi', () => {
    expect(fuentes('form-action').sort()).toEqual(["'self'", 'https://checkout.wompi.co'].sort());
  });

  it('default-src es self', () => {
    expect(fuentes('default-src')).toEqual(["'self'"]);
  });
});

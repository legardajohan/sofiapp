import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { crearUsuario, llamar, tokenDe } from './user.test-helpers.js';
import type { RolEmpresa } from './user.types.js';

// AUTH-04, criterios 4 y 5: matriz de gates por rol de empresa. Solo comprueba la AUTORIZACIÓN
// (403 o no): lo que hace cada endpoint ya lo cubren sus propios tests.
vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn(), subscribeRealtime: vi.fn() }));
vi.mock('../../realtime/internal-bus.js', async (orig) => ({
  ...(await orig<typeof import('../../realtime/internal-bus.js')>()),
  publicarSesionRevocada: vi.fn(),
}));

const { default: app } = await import('../../app.js');

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete';
const id = (): string => new Types.ObjectId().toString();

/** Endpoints cerrados a todo el que no sea Administrador. */
const SOLO_ADMINISTRADOR: Array<[Metodo, string]> = [
  // Datos sensibles y reportes (criterio 4).
  ['get', `/api/clientes/${id()}/notas`],
  ['get', '/api/pendientes'],
  ['post', `/api/conversations/${id()}/summary`],
  ['get', '/api/reports/by-advisor'],
  // Configuración (criterio 5).
  ['get', '/api/channels/whatsapp/status'],
  ['get', '/api/kb/documents'],
  ['get', '/api/kb/faqs'],
  ['get', '/api/ai/assistant'],
  ['get', '/api/ai/handoff-rules'],
  ['get', '/api/sandbox/session'],
  ['get', '/api/send-window'],
  ['get', '/api/flows'],
  ['get', '/api/campaigns'],
  ['get', '/api/tenants/me/ajustes'],
  ['get', '/api/admin-profiles'],
  ['post', '/api/templates/sync'],
  ['post', '/api/estados'],
  ['patch', `/api/tags/${id()}`],
  ['delete', `/api/tags/${id()}`],
  ['post', '/api/campos-contacto'],
  ['post', '/api/opciones-contacto'],
  ['post', '/api/semaforos'],
];

/** Lecturas que consumen la bandeja, leads o la ficha: abiertas a cualquier rol. */
const LECTURAS_OPERATIVAS: string[] = [
  '/api/tags',
  '/api/estados',
  '/api/campos-contacto',
  '/api/opciones-contacto',
  '/api/semaforos',
  '/api/templates',
  '/api/conversations/config/audio',
];

describe('matriz de permisos por rol de empresa (AUTH-04)', () => {
  const tenantId = new Types.ObjectId().toString();
  const tokenPara = async (rolEmpresa: RolEmpresa): Promise<string> =>
    tokenDe(await crearUsuario(tenantId, { rolEmpresa }));

  it.each(['coordinador', 'asesor'] as const)('%s → 403 en datos sensibles, reportes y configuración', async (rol) => {
    const t = await tokenPara(rol);
    for (const [metodo, url] of SOLO_ADMINISTRADOR) {
      const res = await llamar(app, metodo, url, t, metodo === 'get' ? undefined : {});
      expect({ url, status: res.status }).toEqual({ url, status: 403 });
    }
  });

  it('el administrador pasa todos esos gates', async () => {
    const t = await tokenPara('administrador');
    for (const [metodo, url] of SOLO_ADMINISTRADOR) {
      const res = await llamar(app, metodo, url, t, metodo === 'get' ? undefined : {});
      expect({ url, prohibido: res.status === 403 }).toEqual({ url, prohibido: false });
    }
  });

  it.each(['coordinador', 'asesor'] as const)('%s lee los catálogos operativos', async (rol) => {
    const t = await tokenPara(rol);
    for (const url of LECTURAS_OPERATIVAS) {
      const res = await llamar(app, 'get', url, t);
      expect({ url, prohibido: res.status === 403 }).toEqual({ url, prohibido: false });
    }
  });

  it('el asesor puede crear una etiqueta desde la bandeja (HU-OMNI-04), no editarla', async () => {
    const t = await tokenPara('asesor');
    const crear = await llamar(app, 'post', '/api/tags', t, { nombre: 'Urgente', color: '#DC2626' });
    expect(crear.status).not.toBe(403);
  });
});

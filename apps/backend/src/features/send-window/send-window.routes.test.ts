import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

const { publicarInterno } = vi.hoisted(() => ({ publicarInterno: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../realtime/internal-bus.js', () => ({
  SEND_WINDOW_INVALIDATE_CHANNEL: 'send-window:invalidate',
  publicarInterno,
  suscribirInterno: vi.fn(),
}));

import app from '../../app.js';
import { AuditEvent } from '../audit/audit.model.js';
import { SendWindowConfig } from './send-window.model.js';
import { CONFIG_DEFECTO, type IPoliticaVentana } from './send-window.types.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function makeToken(tenantId: string, rol = 'admin', sub = new Types.ObjectId().toString()): string {
  return jwt.sign({ sub, tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true }, SECRET, {
    expiresIn: '1h',
  });
}

const conCookies = (r: request.Test, token: string): request.Test =>
  r.set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`]).set('X-CSRF-Token', CSRF);

function politica(overrides: Partial<IPoliticaVentana> = {}): IPoliticaVentana {
  return { ...structuredClone(CONFIG_DEFECTO), activo: true, ...overrides };
}

function conFranjasCampana(franjas: IPoliticaVentana['reglas'][number]['franjas']): IPoliticaVentana {
  const p = politica();
  p.reglas = p.reglas.map((r) => (r.categoria === 'campana' ? { ...r, franjas } : r));
  return p;
}

describe('/api/send-window', () => {
  let tenantId: string;
  let token: string;

  beforeEach(async () => {
    await SendWindowConfig.syncIndexes();
    tenantId = new Types.ObjectId().toString();
    token = makeToken(tenantId);
    publicarInterno.mockClear();
  });

  it('sin sesión → 401', async () => {
    const res = await request(app).get('/api/send-window');
    expect(res.status).toBe(401);
  });

  it('GET sin documento devuelve los valores de fábrica (inactiva)', async () => {
    const res = await conCookies(request(app).get('/api/send-window'), token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activo: false, zonaHoraria: 'America/Bogota', configurado: false, version: 0 });
    expect(res.body.reglas).toHaveLength(6);
    expect(await SendWindowConfig.countDocuments({})).toBe(0);
  });

  it('PUT válido guarda, versiona, audita e invalida la caché de los demás procesos', async () => {
    const actor = new Types.ObjectId().toString();
    const res = await conCookies(request(app).put('/api/send-window'), makeToken(tenantId, 'admin', actor)).send(
      politica({ excepciones: [{ fecha: '2026-12-25', tipo: 'cerrado', motivo: 'Navidad', origen: 'festivo' }] }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activo: true, configurado: true, version: 1 });
    expect(res.body.excepciones).toEqual([{ fecha: '2026-12-25', tipo: 'cerrado', motivo: 'Navidad', origen: 'festivo' }]);

    const segundo = await conCookies(request(app).put('/api/send-window'), token).send(politica({ activo: false }));
    expect(segundo.body.version).toBe(2);

    expect(publicarInterno).toHaveBeenCalledWith('send-window:invalidate', { tenantId });
    const auditoria = await AuditEvent.find({ tenantId, accion: 'send-window.update' }).sort({ createdAt: 1 }).lean();
    expect(auditoria).toHaveLength(2);
    expect(auditoria[0]!.actorId?.toString()).toBe(actor);
    expect(auditoria[0]!.antes).toMatchObject({ activo: false });
    expect(auditoria[0]!.despues).toMatchObject({ activo: true });
  });

  it('el tenantId del body se ignora: se guarda en el del token', async () => {
    const otro = new Types.ObjectId().toString();
    const res = await conCookies(request(app).put('/api/send-window'), token).send({ ...politica(), tenantId: otro });
    expect(res.status).toBe(200);
    expect(await SendWindowConfig.countDocuments({ tenantId: otro })).toBe(0);
    expect(await SendWindowConfig.countDocuments({ tenantId })).toBe(1);
  });

  describe('400 con la ruta del campo', () => {
    const put = (body: unknown): request.Test => conCookies(request(app).put('/api/send-window'), token).send(body as object);
    const rutas = (res: request.Response): string[] =>
      (res.body.errors as Array<{ path: string }>).map((e) => e.path);

    it('zona desconocida', async () => {
      const res = await put(politica({ zonaHoraria: 'Marte/Olympus' }));
      expect(res.status).toBe(400);
      expect(rutas(res)).toContain('body.zonaHoraria');
    });

    it('formato de hora y 24:00 solo como fin', async () => {
      const res = await put(conFranjasCampana([{ dias: [1], desde: '24:00', hasta: '25:00' }]));
      expect(res.status).toBe(400);
      expect(rutas(res)).toEqual(expect.arrayContaining(['body.reglas.5.franjas.0.desde', 'body.reglas.5.franjas.0.hasta']));
    });

    it('desde = hasta', async () => {
      const res = await put(conFranjasCampana([{ dias: [1], desde: '08:00', hasta: '08:00' }]));
      expect(res.status).toBe(400);
      expect(rutas(res)).toContain('body.reglas.5.franjas.0.hasta');
    });

    it('acepta 24:00 como fin y una franja que cruza la medianoche', async () => {
      const res = await put(
        conFranjasCampana([
          { dias: [1], desde: '20:00', hasta: '24:00' },
          { dias: [5], desde: '22:00', hasta: '02:00' },
        ]),
      );
      expect(res.status).toBe(200);
    });

    it('solape dentro de una regla', async () => {
      const res = await put(
        conFranjasCampana([
          { dias: [5], desde: '22:00', hasta: '02:00' },
          { dias: [6], desde: '01:00', hasta: '05:00' },
        ]),
      );
      expect(res.status).toBe(400);
      expect(res.body.errors).toContainEqual({ path: 'body.reglas.5.franjas', message: 'Las franjas 1 y 2 se solapan el sábado.' });
    });

    it('límites: más de 10 franjas y más de 200 excepciones', async () => {
      const hh = (i: number): string => String(i).padStart(2, '0');
      const franjas = Array.from({ length: 11 }, (_, i) => ({ dias: [1], desde: `${hh(i)}:00`, hasta: `${hh(i)}:30` }));
      expect(rutas(await put(conFranjasCampana(franjas)))).toContain('body.reglas.5.franjas');

      const excepciones = Array.from({ length: 201 }, (_, i) => ({
        fecha: new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10),
        tipo: 'cerrado' as const,
      }));
      expect(rutas(await put(politica({ excepciones })))).toContain('body.excepciones');
    });

    it('fechas inválidas o repetidas', async () => {
      const invalida = await put(politica({ excepciones: [{ fecha: '2026-02-30', tipo: 'cerrado' }] }));
      expect(invalida.status).toBe(400);
      expect(rutas(invalida)).toContain('body.excepciones.0.fecha');

      const repetida = await put(
        politica({
          excepciones: [
            { fecha: '2026-12-25', tipo: 'cerrado' },
            { fecha: '2026-12-25', tipo: 'cerrado' },
          ],
        }),
      );
      expect(repetida.status).toBe(400);
      expect(rutas(repetida)).toContain('body.excepciones.1.fecha');
    });

    it('falta una categoría', async () => {
      const p = politica();
      p.reglas = p.reglas.filter((r) => r.categoria !== 'ia');
      expect(rutas(await put(p))).toContain('body.reglas');
    });
  });

  it('GET /status devuelve el estado por categoría', async () => {
    await conCookies(request(app).put('/api/send-window'), token).send(
      conFranjasCampana([{ dias: [0, 1, 2, 3, 4, 5, 6], desde: '00:00', hasta: '24:00' }]),
    );
    const res = await conCookies(request(app).get('/api/send-window/status'), token);
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(true);
    expect(Object.keys(res.body.categorias)).toHaveLength(6);
    expect(res.body.categorias.asesor).toEqual({ permitido: true, siguienteApertura: null, siguienteCierre: null });
    expect(res.body.categorias.campana.permitido).toBe(true);
  });

  it('POST /holidays/preview devuelve los festivos del año', async () => {
    const res = await conCookies(request(app).post('/api/send-window/holidays/preview'), token).send({ anio: 2026 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(18);
    expect(res.body[0]).toEqual({ fecha: '2026-01-01', motivo: 'Año Nuevo' });

    const fuera = await conCookies(request(app).post('/api/send-window/holidays/preview'), token).send({ anio: 1990 });
    expect(fuera.status).toBe(400);
  });
});

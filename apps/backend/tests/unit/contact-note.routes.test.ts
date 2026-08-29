import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import type { AdminSubrol } from '../../src/features/users/user.types.js';

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

const app = (await import('../../src/app.js')).default;

/**
 * Estos tests existen sobre todo para probar el **montaje**: `/api/clientes/:clienteId/notas` va
 * registrado antes que `/api/clientes`, y Express 5 (path-to-regexp v8) es estricto con los
 * patrones. Un fallo aquí no lo detecta ningún test de service.
 */
describe('contact-note.routes — montaje y gate por subrol (HU-CRM-02)', () => {
  const tenantId = new Types.ObjectId();
  let seq = 0;

  /** Doble envío de CSRF: `csrfGuard` exige que la cookie y el header coincidan en los mutadores. */
  const CSRF = 'test-csrf-token';

  function cookies(subrol?: AdminSubrol): string[] {
    const token = jwt.sign(
      {
        sub: new Types.ObjectId().toString(),
        tenantId: tenantId.toString(),
        rol: 'admin',
        ...(subrol ? { subrol } : {}),
      },
      process.env['JWT_SECRET'] as string,
      { expiresIn: '1h' },
    );
    return [`token=${token}`, `csrfToken=${CSRF}`];
  }

  async function seedCliente(): Promise<string> {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: `wa_route_${seq++}`,
      telefono: '573001112233',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      atributos: [],
      tagIds: [],
    });
    return (cliente._id as Types.ObjectId).toString();
  }

  it('POST /api/clientes/:id/notas crea la nota para un director', async () => {
    const clienteId = await seedCliente();
    const res = await request(app)
      .post(`/api/clientes/${clienteId}/notas`)
      .set('Cookie', cookies('director'))
      .set('X-CSRF-Token', CSRF)
      .send({ texto: 'Acordamos pago el viernes' });

    expect(res.status).toBe(201);
    expect(res.body.texto).toBe('Acordamos pago el viernes');
  });

  it('GET /api/clientes/:id/notas devuelve la página', async () => {
    const clienteId = await seedCliente();
    await request(app)
      .post(`/api/clientes/${clienteId}/notas`)
      .set('Cookie', cookies('manager'))
      .set('X-CSRF-Token', CSRF)
      .send({ texto: 'Primera' });

    const res = await request(app)
      .get(`/api/clientes/${clienteId}/notas`)
      .set('Cookie', cookies('manager'));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].texto).toBe('Primera');
  });

  it('un coordinator recibe 403 tanto al leer como al crear', async () => {
    const clienteId = await seedCliente();

    const post = await request(app)
      .post(`/api/clientes/${clienteId}/notas`)
      .set('Cookie', cookies('coordinator'))
      .set('X-CSRF-Token', CSRF)
      .send({ texto: 'No debería entrar' });
    expect(post.status).toBe(403);

    const get = await request(app)
      .get(`/api/clientes/${clienteId}/notas`)
      .set('Cookie', cookies('coordinator'));
    expect(get.status).toBe(403);
  });

  it('sin sesión → 401, no 404: la ruta existe', async () => {
    const clienteId = await seedCliente();
    const res = await request(app).get(`/api/clientes/${clienteId}/notas`);
    expect(res.status).toBe(401);
  });

  it('el montaje de notas no tapa las rutas de /api/clientes', async () => {
    // Es el riesgo real de registrar la ruta más específica primero.
    const clienteId = await seedCliente();
    const res = await request(app)
      .get(`/api/clientes/${clienteId}/history`)
      .set('Cookie', cookies('director'));

    expect(res.status).toBe(200);
    expect(res.body.contacto.id).toBe(clienteId);
  });

  it('PATCH /api/clientes/:id rechaza un campo con dueño en otro feature', async () => {
    const clienteId = await seedCliente();
    const res = await request(app)
      .patch(`/api/clientes/${clienteId}`)
      .set('Cookie', cookies('director'))
      .set('X-CSRF-Token', CSRF)
      .send({ estadoComercial: 'pagado' });

    expect(res.status).toBe(400);
  });

  it('PATCH /api/clientes/:id: un coordinator edita el nombre pero no el correo', async () => {
    const clienteId = await seedCliente();
    const cookie = cookies('coordinator');

    const permitido = await request(app)
      .patch(`/api/clientes/${clienteId}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', CSRF)
      .send({ nombre: 'Ana' });
    expect(permitido.status).toBe(200);
    expect(permitido.body.nombre).toBe('Ana');

    const prohibido = await request(app)
      .patch(`/api/clientes/${clienteId}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', CSRF)
      .send({ correo: 'ana@empresa.com' });
    expect(prohibido.status).toBe(403);
  });
});

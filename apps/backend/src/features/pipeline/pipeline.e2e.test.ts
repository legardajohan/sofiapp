import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app`.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

import app from '../../app.js';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { User } from '../users/user.model.js';
import { Estado } from '../estado/estado.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { Lead } from '../lead/lead.model.js';
import { seedEstados } from '../../seed/seed-estados.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';

/**
 * Prueba de funcionalidad de la Definición de Hecho: **"mover una oportunidad entre etapas
 * actualiza su estado y el tablero"**.
 *
 * A diferencia de los tests de service, esta recorre el camino completo del usuario contra la
 * app de Express **real** —cadena de middlewares, CSRF, JWT, Zod y Mongo incluidos—, que es lo
 * más cerca del navegador que se puede llegar sin levantar el servidor.
 */

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';
const ACTOR = '507f1f77bcf86cd799439012';

function token(tenantId: string): string {
  return jwt.sign(
    { sub: ACTOR, tenantId, email: 'u@e.com', nombre: 'Carolina', rol: 'admin', activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

function get(t: string, url: string): request.Test {
  return request(app).get(url).set('Cookie', [`token=${t}`]);
}

function patch(t: string, url: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .patch(url)
    .set('Cookie', [`token=${t}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF)
    .send(body);
}

interface Columna {
  etapa: { key: string; label: string; esSalida: boolean };
  total: number;
  leads: { id: string; nombre: string }[];
}

/** Dónde está cada lead, leído del tablero: `nombre → etapa`. */
function ubicaciones(columnas: Columna[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const columna of columnas) {
    for (const lead of columna.leads) mapa[lead.nombre] = columna.etapa.key;
  }
  return mapa;
}

describe('HU-PIPE-01 — DoD: mover una oportunidad actualiza su estado y el tablero', () => {
  let tenantId: Types.ObjectId;
  let jwtA: string;
  let leadAna: string;

  beforeEach(async () => {
    await Lead.deleteMany({});
    await Cliente.deleteMany({});
    await User.deleteMany({});
    await Estado.deleteMany({});
    await AuditEvent.deleteMany({});
    await Lead.syncIndexes();
    await Estado.syncIndexes();
    vi.clearAllMocks();

    tenantId = new Types.ObjectId();
    jwtA = token(tenantId.toString());
    await seedEstados(tenantId);

    await createScoped(User, tenantId, {
      _id: new Types.ObjectId(ACTOR),
      nombre: 'Carolina',
      email: 'carolina@empresa.test',
      passwordHash: 'x',
      rol: 'admin',
      activo: true,
    });

    // Dos oportunidades convertidas desde sus conversaciones, como en la bandeja real.
    for (const [i, nombre] of ['Ana Pérez', 'Luis Gómez'].entries()) {
      const cliente = await createScoped(Cliente, tenantId, {
        metaUserId: `wa_e2e_${i}`,
        telefono: `57300111220${i}`,
        canalOrigen: 'whatsapp',
        estadoComercial: 'nuevo',
        customFields: {},
        tagIds: [],
      });
      const res = await request(app)
        .post('/api/leads')
        .set('Cookie', [`token=${jwtA}`, `csrfToken=${CSRF}`])
        .set('X-CSRF-Token', CSRF)
        .send({ nombre, telefono: `57300111220${i}`, clienteId: String(cliente._id) });
      expect(res.status).toBe(201);
      if (nombre === 'Ana Pérez') leadAna = res.body.id;
    }
  });

  it('el recorrido completo: ver el embudo, mover una oportunidad y verla en su etapa nueva', async () => {
    // 1. El administrador abre el embudo. Las dos oportunidades nacen en "Nuevo".
    const inicial = await get(jwtA, '/api/pipeline');
    expect(inicial.status).toBe(200);
    expect(ubicaciones(inicial.body.columnas)).toEqual({
      'Ana Pérez': 'nuevo',
      'Luis Gómez': 'nuevo',
    });
    const nuevoAntes = inicial.body.columnas.find((c: Columna) => c.etapa.key === 'nuevo');
    expect(nuevoAntes.total).toBe(2);

    // 2. Arrastra a Ana hasta "Pago pendiente".
    const movida = await patch(jwtA, `/api/leads/${leadAna}/stage`, { estado: 'pago_pendiente' });
    expect(movida.status).toBe(200);
    expect(movida.body.estado).toBe('pago_pendiente');

    // 3. El tablero refleja el cambio: Ana cambió de columna y AMBOS totales se movieron con ella.
    const despues = await get(jwtA, '/api/pipeline');
    expect(ubicaciones(despues.body.columnas)).toEqual({
      'Ana Pérez': 'pago_pendiente',
      'Luis Gómez': 'nuevo',
    });
    const porKey = new Map(despues.body.columnas.map((c: Columna) => [c.etapa.key, c]));
    expect((porKey.get('nuevo') as Columna).total).toBe(1);
    expect((porKey.get('pago_pendiente') as Columna).total).toBe(1);

    // 4. El cambio persiste: la tabla —la otra vista— cuenta lo mismo.
    const listado = await get(jwtA, '/api/leads?estado=pago_pendiente');
    expect(listado.body.total).toBe(1);
    expect(listado.body.data[0].nombre).toBe('Ana Pérez');

    // 5. Y queda explicado en el historial, con su autor.
    const historial = await get(jwtA, `/api/leads/${leadAna}/historial-etapa`);
    expect(historial.body.total).toBe(1);
    expect(historial.body.data[0]).toMatchObject({
      de: 'nuevo',
      a: 'pago_pendiente',
      actor: { id: ACTOR, nombre: 'Carolina' },
    });

    // 6. El tablero de los demás administradores se entera sin recargar.
    expect(publishRealtime).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'lead:stage-changed', a: 'pago_pendiente' }),
    );
  });

  it('«Declinado» existe de fábrica y es una etapa de salida donde se puede soltar', async () => {
    const antes = await get(jwtA, '/api/pipeline');
    const declinado = antes.body.columnas.find((c: Columna) => c.etapa.key === 'declinado');
    expect(declinado).toBeDefined();
    expect(declinado.etapa.label).toBe('Declinado');
    expect(declinado.etapa.esSalida).toBe(true);

    expect((await patch(jwtA, `/api/leads/${leadAna}/stage`, { estado: 'declinado' })).status).toBe(
      200,
    );

    const despues = await get(jwtA, '/api/pipeline');
    expect(ubicaciones(despues.body.columnas)['Ana Pérez']).toBe('declinado');
  });

  it('una oportunidad declinada se puede reabrir: la etapa de salida no es una trampa', async () => {
    await patch(jwtA, `/api/leads/${leadAna}/stage`, { estado: 'declinado' });

    expect((await patch(jwtA, `/api/leads/${leadAna}/stage`, { estado: 'en_gestion' })).status).toBe(
      200,
    );

    const tablero = await get(jwtA, '/api/pipeline');
    expect(ubicaciones(tablero.body.columnas)['Ana Pérez']).toBe('en_gestion');
  });

  it('un movimiento rechazado deja el tablero exactamente como estaba', async () => {
    await Estado.updateOne({ tenantId, key: 'pagado' }, { $set: { activo: false } });

    const rechazado = await patch(jwtA, `/api/leads/${leadAna}/stage`, { estado: 'pagado' });
    expect(rechazado.status).toBe(400);

    const tablero = await get(jwtA, '/api/pipeline');
    expect(ubicaciones(tablero.body.columnas)['Ana Pérez']).toBe('nuevo');
    // Y la columna archivada ya no se ofrece como destino.
    expect(tablero.body.columnas.map((c: Columna) => c.etapa.key)).not.toContain('pagado');
  });

  it('el embudo de otra empresa no ve estas oportunidades', async () => {
    const otro = await get(token(new Types.ObjectId().toString()), '/api/pipeline');

    expect(otro.status).toBe(200);
    // Sin etapas propias todavía, el tablero ajeno está vacío — y desde luego sin leads de aquí.
    expect(ubicaciones(otro.body.columnas)).toEqual({});
  });

  it('el filtro por responsable se aplica al tablero entero', async () => {
    const otroAsesor = await createScoped(User, tenantId, {
      nombre: 'Mateo',
      email: 'mateo@empresa.test',
      passwordHash: 'x',
      rol: 'admin',
      activo: true,
    });

    const soloMateo = await get(jwtA, `/api/pipeline?asesor=${String(otroAsesor._id)}`);

    expect(soloMateo.status).toBe(200);
    expect(ubicaciones(soloMateo.body.columnas)).toEqual({});
    expect(soloMateo.body.columnas.every((c: Columna) => c.total === 0)).toBe(true);
  });
});

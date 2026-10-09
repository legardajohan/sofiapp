import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockClassifyTopic } = vi.hoisted(() => ({ mockClassifyTopic: vi.fn() }));

vi.mock('../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classifyTopic: mockClassifyTopic }),
}));

import { createScoped } from '../repositories/base.repository.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import type { IClienteDocument } from '../features/cliente/cliente.types.js';
import { Message } from '../features/message/message.model.js';
import { KbDocument } from '../features/kb/kb-document.model.js';
import { AuditEvent } from '../features/audit/audit.model.js';
import { backfillTemas, parsearArgs, type OpcionesBackfill } from './backfill-temas-conversacion.js';

/* HU-REP-03, criterio 5. Mismo guard y freno que el clasificador en línea: idempotente. */

const DESDE = new Date('2026-07-01T00:00:00Z');
const RECIENTE = new Date('2026-09-15T00:00:00Z');
const VIEJO = new Date('2026-05-01T00:00:00Z');

async function crearTenant(): Promise<Types.ObjectId> {
  const t = await Tenant.create({
    nombre: 'Tenant backfill',
    slug: `backfill-${new Types.ObjectId().toString()}`,
    contacto: { email: 'b@example.com', telefono: '3000000000' },
  });
  await createScoped(KbDocument, t._id, {
    titulo: 'Productos y servicios',
    contenido: 'x',
    estructura: {
      schemaVersion: 1,
      schemaId: 'productos',
      campos: { catalogo: { tipo: 'repetible', items: [{ nombre: 'Curso intensivo' }] } },
      adicional: '',
    },
  });
  return t._id;
}

async function crearHilo(
  tenantId: Types.ObjectId,
  opts: { demo?: boolean; ultimoMensajeAt?: Date } = {},
): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `${opts.demo ? 'demo-' : 'wa_'}${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    ultimoMensajeAt: opts.ultimoMensajeAt ?? RECIENTE,
  });
  const clienteId = (c as unknown as IClienteDocument)._id;
  for (const texto of ['hola', '¿cuánto vale el intensivo?']) {
    await createScoped(Message, tenantId, { clienteId, canal: 'whatsapp', direccion: 'inbound', sender: 'user', tipo: 'text', texto });
  }
  return String(clienteId);
}

const opts = (over: Partial<OpcionesBackfill> = {}): OpcionesBackfill => ({
  desde: DESDE,
  pausaMs: 0,
  dryRun: false,
  ...over,
});

const temaDe = async (clienteId: string): Promise<unknown> => (await Cliente.findById(clienteId).lean())?.temaIA;

describe('HU-REP-03 — backfill de temas', () => {
  let tenantA: Types.ObjectId;
  let tenantB: Types.ObjectId;

  beforeEach(async () => {
    mockClassifyTopic.mockReset().mockResolvedValue({ data: { tema: 'Curso intensivo', confianza: 0.9 } });
    await Promise.all([
      Tenant.deleteMany({}),
      Cliente.deleteMany({}),
      Message.deleteMany({}),
      KbDocument.deleteMany({}),
      AuditEvent.deleteMany({}),
    ]);
    tenantA = await crearTenant();
    tenantB = await crearTenant();
  });

  it('clasifica los candidatos de todos los tenants', async () => {
    const a = await crearHilo(tenantA);
    const b = await crearHilo(tenantB);

    const resumen = await backfillTemas(opts());

    expect(resumen).toEqual({ candidatos: 2, clasificadas: 2, saltadas: 0, fallidas: 0 });
    expect(await temaDe(a)).toMatchObject({ clave: 'curso intensivo' });
    expect(await temaDe(b)).toMatchObject({ clave: 'curso intensivo' });
  });

  it('respeta --desde, excluye demo y filtra por --tenant', async () => {
    await crearHilo(tenantA, { ultimoMensajeAt: VIEJO });
    await crearHilo(tenantA, { demo: true });
    const dentro = await crearHilo(tenantA);
    const otroTenant = await crearHilo(tenantB);

    const resumen = await backfillTemas(opts({ tenantId: tenantA.toString() }));

    expect(resumen).toEqual({ candidatos: 1, clasificadas: 1, saltadas: 0, fallidas: 0 });
    expect(await temaDe(dentro)).toBeDefined();
    expect(await temaDe(otroTenant)).toBeUndefined();
  });

  it('--limite corta el recorrido', async () => {
    for (let i = 0; i < 3; i += 1) await crearHilo(tenantA);

    const resumen = await backfillTemas(opts({ tenantId: tenantA.toString(), limite: 2 }));

    expect(resumen.candidatos).toBe(2);
  });

  it('--dry-run cuenta lo que se clasificaría sin llamar al modelo ni escribir', async () => {
    const a = await crearHilo(tenantA);

    const resumen = await backfillTemas(opts({ dryRun: true, tenantId: tenantA.toString() }));

    expect(resumen).toEqual({ candidatos: 1, clasificadas: 1, saltadas: 0, fallidas: 0 });
    expect(mockClassifyTopic).not.toHaveBeenCalled();
    expect(await temaDe(a)).toBeUndefined();
  });

  it('una segunda corrida da 0 clasificadas y no duplica eventos', async () => {
    await crearHilo(tenantA);
    await backfillTemas(opts());

    const segunda = await backfillTemas(opts());

    expect(segunda).toMatchObject({ clasificadas: 0, saltadas: 1 });
    expect(mockClassifyTopic).toHaveBeenCalledTimes(1);
    expect(await AuditEvent.countDocuments({ accion: 'cliente.tema' })).toBe(1);
  });

  it('un fallo cuenta como fallida sin cortar la corrida', async () => {
    mockClassifyTopic
      .mockRejectedValueOnce(Object.assign(new Error('[429 Too Many Requests]'), { status: 429 }))
      .mockResolvedValue({ data: { tema: 'Curso intensivo', confianza: 0.9 } });
    await crearHilo(tenantA);
    await crearHilo(tenantA);

    const resumen = await backfillTemas(opts({ tenantId: tenantA.toString() }));

    expect(resumen).toEqual({ candidatos: 2, clasificadas: 1, saltadas: 0, fallidas: 1 });
  });
});

describe('HU-REP-03 — parsearArgs del backfill', () => {
  const NOW = new Date('2026-10-09T12:00:00Z');

  it('valores por defecto: 90 días, pausa 1500 ms, sin dry-run', () => {
    const o = parsearArgs([], NOW);
    expect(o).toEqual({ desde: new Date('2026-07-11T12:00:00Z'), pausaMs: 1500, dryRun: false });
  });

  it('lee todas las banderas (con el `--` de pnpm delante)', () => {
    const tenant = new Types.ObjectId().toString();
    const o = parsearArgs(
      ['--', '--tenant', tenant, '--desde', '2026-08-01', '--limite', '50', '--pausa-ms', '0', '--dry-run'],
      NOW,
    );
    expect(o).toEqual({ tenantId: tenant, desde: new Date('2026-08-01'), limite: 50, pausaMs: 0, dryRun: true });
  });

  it.each([
    [['--tenant', 'x']],
    [['--desde', 'no-fecha']],
    [['--limite', '0']],
    [['--pausa-ms', '-1']],
  ])('rechaza argumentos inválidos %j', (args) => {
    expect(() => parsearArgs(args, NOW)).toThrow();
  });
});

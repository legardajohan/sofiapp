import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockClassifyTopic } = vi.hoisted(() => ({ mockClassifyTopic: vi.fn() }));

vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classifyTopic: mockClassifyTopic }),
}));

import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import { Message } from '../message/message.model.js';
import { KbDocument } from '../kb/kb-document.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { clasificarTemaSiHaceFalta } from './ai-topic.service.js';

/*
 * Invariante multi-tenant del clasificador de tema (HU-REP-03, criterio 10): el `tenantId` del job
 * decide qué productos se ofrecen y qué cliente se escribe. Un `clienteId` de otro tenant es
 * invisible.
 */

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

async function sembrarKb(tenantId: Types.ObjectId, nombre: string): Promise<void> {
  await createScoped(KbDocument, tenantId, {
    titulo: 'Productos y servicios',
    contenido: 'x',
    estructura: {
      schemaVersion: 1,
      schemaId: 'productos',
      campos: { catalogo: { tipo: 'repetible', items: [{ nombre }] } },
      adicional: '',
    },
  });
}

async function crearClienteConMensajes(tenantId: Types.ObjectId): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
  });
  const clienteId = (c as unknown as IClienteDocument)._id;
  for (let i = 0; i < 2; i += 1) {
    await createScoped(Message, tenantId, {
      clienteId,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: 'hola',
    });
  }
  return String(clienteId);
}

describe('HU-REP-03 — aislamiento del clasificador de tema', () => {
  beforeEach(async () => {
    mockClassifyTopic.mockReset().mockResolvedValue({ data: { tema: 'Producto de A', confianza: 0.95 } });
    await Promise.all([Cliente.deleteMany({}), Message.deleteMany({}), KbDocument.deleteMany({}), AuditEvent.deleteMany({})]);
    await sembrarKb(tenantA, 'Producto de A');
    await sembrarKb(tenantB, 'Producto de B');
  });

  it('solo ofrece al modelo los productos del tenant del job', async () => {
    const clienteA = await crearClienteConMensajes(tenantA);

    await clasificarTemaSiHaceFalta(tenantA.toString(), clienteA);

    const { opciones, tenantId } = mockClassifyTopic.mock.calls[0]![0] as {
      opciones: Array<{ nombre: string }>;
      tenantId: Types.ObjectId;
    };
    expect(opciones.map((o) => o.nombre)).toEqual(['Producto de A']);
    expect(String(tenantId)).toBe(tenantA.toString());
  });

  it('un nombre de la KB de otro tenant no se acepta: queda como otros', async () => {
    mockClassifyTopic.mockResolvedValue({ data: { tema: 'Producto de B', confianza: 0.95 } });
    const clienteA = await crearClienteConMensajes(tenantA);

    await clasificarTemaSiHaceFalta(tenantA.toString(), clienteA);

    expect((await Cliente.findById(clienteA).lean())?.temaIA).toMatchObject({ clave: null });
  });

  it('con el tenant del job equivocado, no escribe en el cliente de otro tenant', async () => {
    const clienteA = await crearClienteConMensajes(tenantA);

    const resultado = await clasificarTemaSiHaceFalta(tenantB.toString(), clienteA);

    expect(resultado).toBe('saltada');
    expect(mockClassifyTopic).not.toHaveBeenCalled();
    expect((await Cliente.findById(clienteA).lean())?.temaIA).toBeUndefined();
    expect(await AuditEvent.countDocuments({})).toBe(0);
  });

  it('el evento cliente.tema queda en el tenant del cliente', async () => {
    const clienteA = await crearClienteConMensajes(tenantA);

    await clasificarTemaSiHaceFalta(tenantA.toString(), clienteA);

    expect(await AuditEvent.countDocuments({ tenantId: tenantA, accion: 'cliente.tema' })).toBe(1);
    expect(await AuditEvent.countDocuments({ tenantId: tenantB })).toBe(0);
  });
});

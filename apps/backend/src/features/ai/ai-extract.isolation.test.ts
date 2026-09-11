import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockExtract } = vi.hoisted(() => ({ mockExtract: vi.fn() }));

// El servicio importa el singleton de AIService, que abre Redis al instanciarse.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ extract: mockExtract }),
}));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
}));

import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { confirmarDatosExtraidos } from '../cliente/cliente.service.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { extraerDatosSiHaceFalta } from './ai-extract.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const actorB = new Types.ObjectId().toString();

const HISTORIAL: ChatTurn[] = [
  { role: 'user', content: 'hola, soy Diego Ramírez' },
  { role: 'model', content: 'un gusto' },
  { role: 'user', content: 'me interesa el curso sabatino' },
];

async function crearCliente(tenantId: Types.ObjectId): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    iaHabilitada: true,
    ultimoMensajeAt: new Date(),
  });
  const id = String((c as unknown as IClienteDocument)._id);
  await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(id),
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'text',
    texto: 'hola, soy Diego Ramírez, me interesa el curso sabatino',
  });
  return id;
}

describe('HU-IA-06 — aislamiento multi-tenant de la extracción', () => {
  beforeEach(() => {
    mockExtract.mockReset();
    mockExtract.mockResolvedValue({
      data: {
        nombreCompleto: 'Diego Ramírez',
        correo: 'diego@empresa.com',
        telefono: null,
        interes: 'curso sabatino',
      },
    });
  });

  it('la extracción de tenantA no escribe en el cliente de tenantB', async () => {
    const clienteA = await crearCliente(tenantA);
    const clienteB = await crearCliente(tenantB);

    await extraerDatosSiHaceFalta(tenantA.toString(), clienteA, HISTORIAL);

    const a = await findByIdScoped(Cliente, tenantA, clienteA).lean();
    const b = await findByIdScoped(Cliente, tenantB, clienteB).lean();
    expect(a!.datosExtraidos?.nombreCompleto).toBe('Diego Ramírez');
    expect(b!.datosExtraidos).toBeUndefined();
  });

  /**
   * El caso que de verdad importa: el id existe, pero es de otro tenant. Sin `findByIdScoped` esto
   * escribiría datos de la conversación de A sobre la ficha de B.
   */
  it('no extrae sobre un cliente de otro tenant aunque el id exista', async () => {
    const clienteB = await crearCliente(tenantB);

    await extraerDatosSiHaceFalta(tenantA.toString(), clienteB, HISTORIAL);

    expect(mockExtract).not.toHaveBeenCalled();
    const b = await findByIdScoped(Cliente, tenantB, clienteB).lean();
    expect(b!.datosExtraidos).toBeUndefined();
  });

  it('la bitácora de la extracción queda en el tenant que la disparó', async () => {
    const clienteA = await crearCliente(tenantA);

    await extraerDatosSiHaceFalta(tenantA.toString(), clienteA, HISTORIAL);

    expect(await AuditEvent.countDocuments({ tenantId: tenantA, accion: 'cliente.extract' })).toBe(1);
    expect(await AuditEvent.countDocuments({ tenantId: tenantB })).toBe(0);
  });

  it('confirmar un contacto de otro tenant responde 404 y no escribe nada', async () => {
    const clienteA = await crearCliente(tenantA);
    await extraerDatosSiHaceFalta(tenantA.toString(), clienteA, HISTORIAL);

    await expect(
      confirmarDatosExtraidos(tenantB.toString(), actorB, clienteA, ['nombreCompleto'], true),
    ).rejects.toMatchObject({ statusCode: 404 });

    const a = await findByIdScoped(Cliente, tenantA, clienteA).lean();
    expect(a!.nombre).toBeUndefined();
    expect(a!.datosExtraidos?.confirmados).toEqual([]);
    expect(
      await AuditEvent.countDocuments({ tenantId: tenantB, accion: 'cliente.extract-confirm' }),
    ).toBe(0);
  });
});

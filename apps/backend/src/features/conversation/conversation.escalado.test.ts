/**
 * `marcarParaAsesor` (HU-IA-02): cuando la IA no puede responder, la conversación tiene que subir
 * a la bandeja para que la recoja una persona. Sin esto el fallo se queda en un log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const { mockPublish } = vi.hoisted(() => ({ mockPublish: vi.fn() }));

vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: mockPublish }));

import { marcarParaAsesor } from './conversation.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { createScoped } from '../../repositories/base.repository.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

async function crearCliente(tenantId: Types.ObjectId, noLeidos = 0): Promise<Types.ObjectId> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    noLeidos,
  });
  return (cliente as unknown as IClienteDocument)._id as Types.ObjectId;
}

describe('marcarParaAsesor (HU-IA-02)', () => {
  beforeEach(async () => {
    mockPublish.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
  });

  it('incrementa los no leídos para que la conversación destaque en la bandeja', async () => {
    const clienteId = await crearCliente(tenantA, 2);

    await marcarParaAsesor(tenantA.toString(), clienteId.toString());

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.noLeidos).toBe(3);
  });

  it('publica conversation:updated para que salte en vivo, sin esperar a un refresco', async () => {
    const clienteId = await crearCliente(tenantA);

    await marcarParaAsesor(tenantA.toString(), clienteId.toString());

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const evento = mockPublish.mock.calls[0]?.[0] as { type: string; conversationId: string };
    expect(evento.type).toBe('conversation:updated');
    expect(evento.conversationId).toBe(clienteId.toString());
  });

  it('NO apaga la IA: un fallo pasajero no debe desactivar el asistente para siempre', async () => {
    const clienteId = await crearCliente(tenantA);

    await marcarParaAsesor(tenantA.toString(), clienteId.toString());

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.iaHabilitada).toBe(true);
  });

  it('AISLAMIENTO: no alcanza a una conversación de otro tenant', async () => {
    const clienteId = await crearCliente(tenantA, 1);

    await marcarParaAsesor(tenantB.toString(), clienteId.toString());

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.noLeidos).toBe(1);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('una conversación inexistente sale en silencio, sin escalar el error', async () => {
    await expect(
      marcarParaAsesor(tenantA.toString(), new Types.ObjectId().toString()),
    ).resolves.toBeUndefined();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

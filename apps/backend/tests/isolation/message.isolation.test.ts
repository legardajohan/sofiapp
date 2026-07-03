import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findScoped } from '../../src/repositories/base.repository.js';
import { Message } from '../../src/features/message/message.model.js';
import { Cliente } from '../../src/features/cliente/cliente.model.js';

describe('Aislamiento multi-tenant', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  it('Message de tenantA no retorna en findScoped de tenantB', async () => {
    const clienteId = new Types.ObjectId();

    await createScoped(Message, tenantA, {
      clienteId,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: 'Mensaje privado de tenantA',
      status: 'sent',
    });

    const resultados = await findScoped(Message, tenantB).lean();
    expect(resultados).toHaveLength(0);
  });

  it('Cliente de tenantA no retorna en findScoped de tenantB', async () => {
    await createScoped(Cliente, tenantA, {
      metaUserId: 'wa_isolation_test',
      telefono: '521234500000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
    });

    const resultados = await findScoped(Cliente, tenantB).lean();
    expect(resultados).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findScoped } from '../../src/repositories/base.repository.js';
import { Message } from '../../src/features/message/message.model.js';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { saveMessage, updateDeliveryStatus } from '../../src/features/message/message.service.js';

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

  it('saveMessage: el dedupe por metaMessageId es por tenant, no global', async () => {
    const metaMessageId = 'wamid.DEDUPE_TEST';
    const clienteIdA = new Types.ObjectId();
    const clienteIdB = new Types.ObjectId();

    const msgA = await saveMessage(tenantA, {
      tenantId: tenantA,
      clienteId: clienteIdA,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: 'Hola desde tenantA',
      metaMessageId,
      status: 'sent',
    });

    // Mismo metaMessageId, tenant distinto: debe crear su propio documento, no devolver el de A.
    const msgB = await saveMessage(tenantB, {
      tenantId: tenantB,
      clienteId: clienteIdB,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: 'Hola desde tenantB',
      metaMessageId,
      status: 'sent',
    });

    expect(msgA._id.toString()).not.toBe(msgB._id.toString());
    expect((msgB as unknown as { tenantId: Types.ObjectId }).tenantId.toString()).toBe(
      tenantB.toString(),
    );

    // El dedupe real (mismo tenant, mismo metaMessageId) sigue funcionando.
    const msgADuplicado = await saveMessage(tenantA, {
      tenantId: tenantA,
      clienteId: clienteIdA,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: 'Reintento del mismo mensaje',
      metaMessageId,
      status: 'sent',
    });
    expect(msgADuplicado._id.toString()).toBe(msgA._id.toString());
  });

  it('updateDeliveryStatus: no modifica el mensaje de otro tenant con el mismo metaMessageId', async () => {
    const metaMessageId = 'wamid.STATUS_TEST';

    const msgA = await createScoped(Message, tenantA, {
      clienteId: new Types.ObjectId(),
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'agent',
      tipo: 'text',
      texto: 'Mensaje de tenantA',
      metaMessageId,
      status: 'sent',
    });
    const msgB = await createScoped(Message, tenantB, {
      clienteId: new Types.ObjectId(),
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'agent',
      tipo: 'text',
      texto: 'Mensaje de tenantB',
      metaMessageId,
      status: 'sent',
    });

    await updateDeliveryStatus(tenantB, metaMessageId, 'read');

    const recargadoA = await Message.findById(msgA._id).lean();
    const recargadoB = await Message.findById(msgB._id).lean();

    expect(recargadoA?.status).toBe('sent');
    expect(recargadoB?.status).toBe('read');
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

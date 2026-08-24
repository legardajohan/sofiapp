import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';

// Mock del cliente de Meta para verificar que NO se llama cuando la cuota bloquea.
vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

import { metaWhatsAppClient } from '../../integrations/meta/meta-whatsapp.client.js';
import { Plan } from '../plan/plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { TenantUsage } from '../usage/usage.model.js';
import { getCurrentPeriodo } from '../usage/usage.service.js';
import { sendMessage } from './message.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';

describe('sendMessage — cuota de mensajes (HU-SAAS-02 · DoD)', () => {
  it('bloquea con 429 y NO envía cuando el tenant Básico alcanzó su límite de mensajes', async () => {
    const plan = await Plan.create({
      nombre: 'Básico',
      limites: { usuarios: 3, administradores: 3, mensajesMes: 2, leads: 500, campanasMes: 2 },
      precio: 0,
    });
    const tenant = await Tenant.create({
      nombre: 'Empresa Básica',
      slug: 'empresa-basica',
      contacto: { email: 'b@t.com', telefono: '3000000000' },
      estado: 'activo',
      planId: plan._id,
    });
    await TenantUsage.create({
      tenantId: tenant._id,
      periodo: getCurrentPeriodo(),
      mensajesMes: 2,
      campanasMes: 0,
    });

    await expect(
      sendMessage(tenant._id.toString(), {
        clienteId: new Types.ObjectId().toString(),
        texto: 'hola',
      })
    ).rejects.toMatchObject({ statusCode: 429 });

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
  });
});

describe('sendMessage — autoría del mensaje saliente (HU-IA-01)', () => {
  /** Tenant con plan holgado, canal conectado y un cliente dentro de la ventana de 24 h. */
  async function escenarioListoParaEnviar(): Promise<{ tenantId: string; clienteId: string }> {
    const plan = await Plan.create({
      nombre: `Pro ${new Types.ObjectId().toString()}`,
      limites: { usuarios: 10, administradores: 10, mensajesMes: 1000, leads: 5000, campanasMes: 50 },
      precio: 0,
    });
    const tenant = await Tenant.create({
      nombre: 'Empresa con IA',
      slug: `empresa-ia-${new Types.ObjectId().toString()}`,
      contacto: { email: 'ia@t.com', telefono: '3000000000' },
      estado: 'activo',
      planId: plan._id,
    });
    const tenantId = tenant._id.toString();

    await MetaIntegration.create({
      tenantId: tenant._id,
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token-de-prueba'),
      activo: true,
    });

    const manana = new Date(Date.now() + 60 * 60 * 1000);
    const cliente = await createScoped(Cliente, tenantId, {
      metaUserId: `wa_${new Types.ObjectId().toString()}`,
      telefono: '573001112233',
      canalOrigen: 'whatsapp',
      ventana24hExpiraEn: manana,
    });

    return { tenantId, clienteId: String((cliente as unknown as IClienteDocument)._id) };
  }

  it('sin `sender` explícito escribe como asesor: el comportamiento previo no cambia', async () => {
    const { tenantId, clienteId } = await escenarioListoParaEnviar();
    vi.mocked(metaWhatsAppClient.sendText).mockResolvedValue({ messageId: 'wamid.1' });

    const msg = await sendMessage(tenantId, { clienteId, texto: 'Respuesta del asesor' });

    expect(msg.sender).toBe('agent');
  });

  it('con `sender: bot` la respuesta queda marcada como de Sofi, distinguible del asesor', async () => {
    const { tenantId, clienteId } = await escenarioListoParaEnviar();
    vi.mocked(metaWhatsAppClient.sendText).mockResolvedValue({ messageId: 'wamid.2' });

    const msg = await sendMessage(tenantId, {
      clienteId,
      texto: 'Atendemos de 8:00 a 18:00.',
      sender: 'bot',
    });

    expect(msg.sender).toBe('bot');
    expect(msg.direccion).toBe('outbound');
  });
});

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

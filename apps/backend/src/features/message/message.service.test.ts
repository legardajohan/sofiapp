import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

// Mock del cliente de Meta para verificar que NO se llama cuando la cuota bloquea.
vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

import { metaWhatsAppClient } from '../../integrations/meta/meta-whatsapp.client.js';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { Plan } from '../plan/plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { TenantUsage } from '../usage/usage.model.js';
import { getCurrentPeriodo } from '../usage/usage.service.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { sendMessage, sendOutbound } from './message.service.js';
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

async function crearCliente(tenantId: Types.ObjectId, ventanaAbierta: boolean): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${Date.now()}_${Math.random()}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ventana24hExpiraEn: ventanaAbierta ? new Date(Date.now() + 60_000) : new Date(Date.now() - 60_000),
    customFields: {},
    tagIds: [],
  });
  return String(doc._id);
}

async function crearIntegracion(tenantId: Types.ObjectId): Promise<void> {
  await createScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
    wabaId: 'waba-1',
    phoneNumberId: 'phone-1',
    accessTokenEnc: encrypt('token'),
    activo: true,
  });
}

async function crearPlantillaAprobada(tenantId: Types.ObjectId, parametrosBody = 1): Promise<string> {
  const cuerpo = parametrosBody === 1 ? 'Hola {{1}}' : 'Hola';
  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: 'meta-tpl-1',
    name: 'recordatorio',
    language: 'es',
    category: 'UTILITY',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: cuerpo }],
    parametrosBody,
    syncedAt: new Date(),
    obsoleta: false,
  });
  return String(doc._id);
}

describe('sendOutbound — único juez de la ventana de 24 h (HT-WA-02)', () => {
  beforeEach(() => {
    vi.mocked(metaWhatsAppClient.sendText).mockClear();
    vi.mocked(metaWhatsAppClient.sendTemplate).mockClear();
  });

  it("modo:'texto' con ventana abierta → sendText, Message con tipo:'text'", async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const clienteId = await crearCliente(tenantId, true);
    vi.mocked(metaWhatsAppClient.sendText).mockResolvedValueOnce({ messageId: 'wamid.TEXT1' });

    const message = await sendOutbound(tenantId, clienteId, { modo: 'texto', texto: 'Hola' });

    expect(metaWhatsAppClient.sendText).toHaveBeenCalledOnce();
    expect(message.tipo).toBe('text');
  });

  it("modo:'texto' con ventana cerrada → AppError 422 con el mensaje literal de siempre", async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const clienteId = await crearCliente(tenantId, false);

    await expect(sendOutbound(tenantId, clienteId, { modo: 'texto', texto: 'Hola' })).rejects.toMatchObject({
      statusCode: 422,
      message: 'Fuera de la ventana de 24 h. Solo se pueden enviar plantillas HSM aprobadas.',
    });
    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
  });

  it("modo:'auto' con ventana cerrada y plantillaFallback → sendTemplate, Message con tipo:'template'", async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const clienteId = await crearCliente(tenantId, false);
    const templateId = await crearPlantillaAprobada(tenantId, 1);
    vi.mocked(metaWhatsAppClient.sendTemplate).mockResolvedValueOnce({ messageId: 'wamid.TPL1' });

    const message = await sendOutbound(tenantId, clienteId, {
      modo: 'auto',
      texto: 'Hola',
      plantillaFallback: { templateId, parametros: ['Ana'] },
    });

    expect(metaWhatsAppClient.sendTemplate).toHaveBeenCalledOnce();
    expect(message.tipo).toBe('template');
    expect(message.sender).toBe('bot');
  });

  it("modo:'auto' con ventana cerrada y sin fallback → 422", async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const clienteId = await crearCliente(tenantId, false);

    await expect(
      sendOutbound(tenantId, clienteId, { modo: 'auto', texto: 'Hola' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("modo:'plantilla' con ventana ABIERTA → permitido (Meta lo acepta en cualquier momento)", async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const clienteId = await crearCliente(tenantId, true);
    const templateId = await crearPlantillaAprobada(tenantId, 1);
    vi.mocked(metaWhatsAppClient.sendTemplate).mockResolvedValueOnce({ messageId: 'wamid.TPL2' });

    const message = await sendOutbound(tenantId, clienteId, {
      modo: 'plantilla',
      templateId,
      parametros: ['Ana'],
    });

    expect(message.tipo).toBe('template');
  });

  it('cuota agotada → falla antes de llamar a Meta en los tres modos', async () => {
    const plan = await Plan.create({
      nombre: 'Básico agotado',
      limites: { usuarios: 3, administradores: 3, mensajesMes: 0, leads: 500, campanasMes: 2 },
      precio: 0,
    });
    const tenant = await Tenant.create({
      nombre: 'Empresa Agotada',
      slug: 'empresa-agotada',
      contacto: { email: 'a@t.com', telefono: '3000000000' },
      estado: 'activo',
      planId: plan._id,
    });
    await TenantUsage.create({
      tenantId: tenant._id,
      periodo: getCurrentPeriodo(),
      mensajesMes: 0,
      campanasMes: 0,
    });
    const clienteId = await crearCliente(tenant._id, true);
    const templateId = await crearPlantillaAprobada(tenant._id, 1);

    await expect(
      sendOutbound(tenant._id, clienteId, { modo: 'texto', texto: 'Hola' }),
    ).rejects.toMatchObject({ statusCode: 429 });
    await expect(
      sendOutbound(tenant._id, clienteId, { modo: 'auto', texto: 'Hola' }),
    ).rejects.toMatchObject({ statusCode: 429 });
    await expect(
      sendOutbound(tenant._id, clienteId, { modo: 'plantilla', templateId, parametros: ['Ana'] }),
    ).rejects.toMatchObject({ statusCode: 429 });

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
    expect(metaWhatsAppClient.sendTemplate).not.toHaveBeenCalled();
  });

  it('un envío por plantilla exitoso llama a incrementUsage', async () => {
    const plan = await Plan.create({
      nombre: 'Con cupo',
      limites: { usuarios: 3, administradores: 3, mensajesMes: 10, leads: 500, campanasMes: 2 },
      precio: 0,
    });
    const tenant = await Tenant.create({
      nombre: 'Empresa Con Cupo',
      slug: 'empresa-con-cupo',
      contacto: { email: 'c@t.com', telefono: '3000000000' },
      estado: 'activo',
      planId: plan._id,
    });
    await crearIntegracion(tenant._id);
    const clienteId = await crearCliente(tenant._id, false);
    const templateId = await crearPlantillaAprobada(tenant._id, 1);
    vi.mocked(metaWhatsAppClient.sendTemplate).mockResolvedValueOnce({ messageId: 'wamid.TPL3' });

    await sendOutbound(tenant._id, clienteId, { modo: 'plantilla', templateId, parametros: ['Ana'] });

    const usage = await TenantUsage.findOne({ tenantId: tenant._id, periodo: getCurrentPeriodo() }).lean();
    expect(usage?.mensajesMes).toBe(1);
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

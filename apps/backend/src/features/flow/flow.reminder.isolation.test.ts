import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

import { metaWhatsAppClient } from '../../integrations/meta/meta-whatsapp.client.js';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { Plan } from '../plan/plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { buscarCandidatos, filtrarPorConfiguracionTenant, enviarRecordatorio } from './flow.reminder.service.js';

async function crearIntegracion(tenantId: Types.ObjectId, phoneNumberId: string): Promise<void> {
  await createScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
    wabaId: `waba-${phoneNumberId}`,
    phoneNumberId,
    accessTokenEnc: encrypt('token'),
    activo: true,
  });
}

async function crearPlantillaAprobada(tenantId: Types.ObjectId, nombre: string): Promise<string> {
  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: `meta-${nombre}`,
    name: nombre,
    language: 'es',
    category: 'UTILITY',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hola {{1}}' }],
    parametrosBody: 1,
    syncedAt: new Date(),
    obsoleta: false,
  });
  return String(doc._id);
}

async function crearTenant(nombre: string, recordatorio: Record<string, unknown>): Promise<Types.ObjectId> {
  const plan = await Plan.create({
    nombre: `Plan ${nombre}`,
    limites: { usuarios: 3, administradores: 3, mensajesMes: 100, leads: 500, campanasMes: 2 },
    precio: 0,
  });
  const tenant = await Tenant.create({
    nombre,
    slug: `${nombre}-${Math.random().toString(36).slice(2)}`,
    contacto: { email: `${nombre}@t.com`, telefono: '3000000000' },
    estado: 'activo',
    planId: plan._id,
    recordatorio,
  });
  return tenant._id as Types.ObjectId;
}

async function crearClienteACandidato(tenantId: Types.ObjectId): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_iso_rem_${Math.random()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ventana24hExpiraEn: new Date(Date.now() + 30 * 60_000),
    iaHabilitada: true,
    customFields: {},
    tagIds: [],
  });
  return String(doc._id);
}

beforeEach(() => {
  vi.mocked(metaWhatsAppClient.sendText).mockClear();
  vi.mocked(metaWhatsAppClient.sendTemplate).mockClear();
});

describe('HU-FLOW-02 — aislamiento multi-tenant del recordatorio', () => {
  it('con dos tenants con candidatos simultáneos, el filtro respeta la política de CADA tenant', async () => {
    const tenantA = await crearTenant('A-activo', { activo: true, antelacionMinutos: 60, texto: 'Hola A' });
    const tenantB = await crearTenant('B-inactivo', { activo: false, antelacionMinutos: 60, texto: 'Hola B' });
    const clienteA = await crearClienteACandidato(tenantA);
    const clienteB = await crearClienteACandidato(tenantB);

    const ahora = new Date();
    const candidatos = await buscarCandidatos(ahora);
    const idsCandidatos = candidatos.map((c) => c.clienteId);
    expect(idsCandidatos).toEqual(expect.arrayContaining([clienteA, clienteB]));

    const elegibles = await filtrarPorConfiguracionTenant(candidatos, ahora);
    const idsElegibles = elegibles.map((c) => c.clienteId);
    expect(idsElegibles).toContain(clienteA);
    expect(idsElegibles).not.toContain(clienteB);
  });

  it('enviarRecordatorio(tenantA, clienteDeB) → 404, y no marca ni envía nada', async () => {
    const tenantA = await crearTenant('A-solo', { activo: true, antelacionMinutos: 120, texto: 'Hola A' });
    const tenantB = await crearTenant('B-solo', { activo: true, antelacionMinutos: 120, texto: 'Hola B' });
    const clienteB = await crearClienteACandidato(tenantB);

    await expect(enviarRecordatorio(tenantA.toString(), clienteB)).rejects.toMatchObject({ statusCode: 404 });

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
    const clienteIntacto = await Cliente.findById(clienteB).lean();
    expect(clienteIntacto?.recordatorioEnviadoParaVentana).toBeFalsy();
  });

  it('un templateId mal configurado apuntando a la plantilla de OTRO tenant nunca se resuelve', async () => {
    const tenantA = await crearTenant('A-plantilla', { activo: true, antelacionMinutos: 120, texto: 'Hola A' });
    const tenantB = await crearTenant('B-plantilla', { activo: true, antelacionMinutos: 120, texto: 'Hola B' });
    await crearIntegracion(tenantA, 'phone-A');
    await crearIntegracion(tenantB, 'phone-B');
    const templateB = await crearPlantillaAprobada(tenantB, 'solo-de-b');
    // Misconfiguración deliberada: A apunta a una plantilla que en realidad es de B.
    await Tenant.findByIdAndUpdate(tenantA, { 'recordatorio.templateId': templateB });
    const clienteA = await crearClienteACandidato(tenantA);
    // Ventana ya vencida: obliga a `sendOutbound` a intentar el camino de plantilla.
    await Cliente.findByIdAndUpdate(clienteA, { ventana24hExpiraEn: new Date(Date.now() - 60_000) });

    // `buildTemplatePayload` busca la plantilla con `findByIdScoped(..., tenantA, templateB)`:
    // el filtro por tenant no la encuentra, así que resulta en 404 — nunca en un envío con la
    // plantilla de B. El 404 no es de los códigos degradados (422/429), así que se propaga.
    await expect(enviarRecordatorio(tenantA.toString(), clienteA)).rejects.toMatchObject({ statusCode: 404 });
    expect(metaWhatsAppClient.sendTemplate).not.toHaveBeenCalled();
  });

  it('marcar recordatorioEnviadoParaVentana en A no altera el documento de B', async () => {
    const tenantA = await crearTenant('A-marca', { activo: true, antelacionMinutos: 120, texto: 'Hola A' });
    const tenantB = await crearTenant('B-marca', { activo: true, antelacionMinutos: 120, texto: 'Hola B' });
    await crearIntegracion(tenantA, 'phone-marca-A');
    const clienteA = await crearClienteACandidato(tenantA);
    const clienteB = await crearClienteACandidato(tenantB);
    vi.mocked(metaWhatsAppClient.sendText).mockResolvedValueOnce({ messageId: 'wamid.ISO1' });

    await enviarRecordatorio(tenantA.toString(), clienteA);

    const aDespues = await Cliente.findById(clienteA).lean();
    const bDespues = await Cliente.findById(clienteB).lean();
    expect(aDespues?.recordatorioEnviadoParaVentana).toBeTruthy();
    expect(bDespues?.recordatorioEnviadoParaVentana).toBeFalsy();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Types } from 'mongoose';

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
import type { ITenantDocument } from '../tenant/tenant.types.js';
import { buscarCandidatos, enviarRecordatorio } from './flow.reminder.service.js';

async function crearIntegracion(tenantId: Types.ObjectId): Promise<void> {
  await createScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
    wabaId: 'waba-rem',
    phoneNumberId: `phone-rem-${tenantId.toString()}`,
    accessTokenEnc: encrypt('token'),
    activo: true,
  });
}

async function crearPlantillaAprobada(tenantId: Types.ObjectId): Promise<string> {
  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: 'meta-tpl-rem',
    name: 'recordatorio',
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

interface RecordatorioOverrides {
  activo?: boolean;
  antelacionMinutos?: number;
  texto?: string;
  templateId?: string;
}

async function crearTenantConRecordatorio(overrides: RecordatorioOverrides = {}): Promise<ITenantDocument> {
  const plan = await Plan.create({
    nombre: 'Plan recordatorio',
    limites: { usuarios: 3, administradores: 3, mensajesMes: 100, leads: 500, campanasMes: 2 },
    precio: 0,
  });
  const tenant = await Tenant.create({
    nombre: `Empresa ${Math.random()}`,
    slug: `empresa-rem-${Math.random().toString(36).slice(2)}`,
    contacto: { email: 'rem@t.com', telefono: '3000000000' },
    estado: 'activo',
    planId: plan._id,
    recordatorio: {
      activo: overrides.activo ?? true,
      antelacionMinutos: overrides.antelacionMinutos ?? 120,
      texto: overrides.texto ?? '¡Hola! ¿Sigues por ahí?',
      templateId: overrides.templateId,
    },
  });
  return tenant as unknown as ITenantDocument;
}

interface ClienteOverrides {
  iaHabilitada?: boolean;
  estadoComercial?: string;
  recordatorioEnviadoParaVentana?: Date;
}

async function crearClienteVentana(
  tenantId: Types.ObjectId,
  msHastaExpirar: number,
  overrides: ClienteOverrides = {},
): Promise<{ clienteId: string; ventana24hExpiraEn: Date }> {
  const ventana24hExpiraEn = new Date(Date.now() + msHastaExpirar);
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_rem_${Math.random()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    estadoComercial: overrides.estadoComercial ?? 'nuevo',
    ventana24hExpiraEn,
    iaHabilitada: overrides.iaHabilitada ?? true,
    recordatorioEnviadoParaVentana: overrides.recordatorioEnviadoParaVentana,
    customFields: {},
    tagIds: [],
  });
  return { clienteId: String(doc._id), ventana24hExpiraEn };
}

beforeEach(() => {
  vi.mocked(metaWhatsAppClient.sendText).mockClear();
  vi.mocked(metaWhatsAppClient.sendTemplate).mockClear();
});

describe('enviarRecordatorio — Definition of Done de HU-FLOW-02', () => {
  it('una conversación inactiva recibe el recordatorio antes de que expire su ventana (texto libre)', async () => {
    const tenant = await crearTenantConRecordatorio({ antelacionMinutos: 120 });
    await crearIntegracion(tenant._id);
    const { clienteId } = await crearClienteVentana(tenant._id, 60 * 60_000); // expira en 1h, antelación 2h
    vi.mocked(metaWhatsAppClient.sendText).mockResolvedValueOnce({ messageId: 'wamid.R1' });

    await enviarRecordatorio(tenant._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendText).toHaveBeenCalledOnce();
    expect(metaWhatsAppClient.sendTemplate).not.toHaveBeenCalled();
  });

  it('con la ventana ya vencida, sale como plantilla HSM aprobada (criterio 9)', async () => {
    const tenant0 = await crearTenantConRecordatorio();
    await crearIntegracion(tenant0._id);
    const templateId = await crearPlantillaAprobada(tenant0._id);
    await Tenant.findByIdAndUpdate(tenant0._id, { 'recordatorio.templateId': templateId });
    const { clienteId } = await crearClienteVentana(tenant0._id, -10 * 60_000); // ya expiró
    vi.mocked(metaWhatsAppClient.sendTemplate).mockResolvedValueOnce({ messageId: 'wamid.R2' });

    await enviarRecordatorio(tenant0._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendTemplate).toHaveBeenCalledOnce();
    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
  });

  it('sin plantilla configurada y ventana vencida: se omite, se registra y NO se reintenta (criterio 10)', async () => {
    const tenant = await crearTenantConRecordatorio(); // sin templateId
    await crearIntegracion(tenant._id);
    const { clienteId, ventana24hExpiraEn } = await crearClienteVentana(tenant._id, -10 * 60_000);

    await expect(enviarRecordatorio(tenant._id.toString(), clienteId)).resolves.toBeUndefined();

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
    expect(metaWhatsAppClient.sendTemplate).not.toHaveBeenCalled();
    // Queda marcado igual: no debe reintentarse en el próximo barrido.
    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.recordatorioEnviadoParaVentana?.getTime()).toBe(ventana24hExpiraEn.getTime());
  });

  it('cuota agotada: termina sin enviar y lo registra (criterio 11)', async () => {
    const plan = await Plan.create({
      nombre: 'Plan agotado',
      limites: { usuarios: 3, administradores: 3, mensajesMes: 0, leads: 500, campanasMes: 2 },
      precio: 0,
    });
    const tenant = await Tenant.create({
      nombre: 'Empresa agotada',
      slug: `empresa-agotada-rem-${Math.random().toString(36).slice(2)}`,
      contacto: { email: 'agotada@t.com', telefono: '3000000000' },
      estado: 'activo',
      planId: plan._id,
      recordatorio: { activo: true, antelacionMinutos: 120, texto: 'Hola' },
    });
    await TenantUsage.create({ tenantId: tenant._id, periodo: getCurrentPeriodo(), mensajesMes: 0, campanasMes: 0 });
    await crearIntegracion(tenant._id);
    const { clienteId } = await crearClienteVentana(tenant._id, 60 * 60_000);

    await expect(enviarRecordatorio(tenant._id.toString(), clienteId)).resolves.toBeUndefined();

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
  });

  it('no se envía si iaHabilitada es false', async () => {
    const tenant = await crearTenantConRecordatorio();
    await crearIntegracion(tenant._id);
    const { clienteId } = await crearClienteVentana(tenant._id, 60 * 60_000, { iaHabilitada: false });

    await enviarRecordatorio(tenant._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.recordatorioEnviadoParaVentana).toBeFalsy();
  });

  it.each(['pagado', 'perdido'])('no se envía si estadoComercial es %s', async (estadoComercial) => {
    const tenant = await crearTenantConRecordatorio();
    await crearIntegracion(tenant._id);
    const { clienteId } = await crearClienteVentana(tenant._id, 60 * 60_000, { estadoComercial });

    await enviarRecordatorio(tenant._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
  });

  it('no se envía si hubo actividad después (la ventana se alejó más allá de la antelación)', async () => {
    const tenant = await crearTenantConRecordatorio({ antelacionMinutos: 120 });
    await crearIntegracion(tenant._id);
    // Un inbound reciente recalculó ventana24hExpiraEn a casi 24h en el futuro: ya no está en la
    // franja de antelación de 2h, así que "hubo actividad después" y no se envía nada.
    const { clienteId } = await crearClienteVentana(tenant._id, 23 * 60 * 60_000);

    await enviarRecordatorio(tenant._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
  });

  it('recordatorio.activo:false en el tenant → no se envía nada', async () => {
    const tenant = await crearTenantConRecordatorio({ activo: false });
    await crearIntegracion(tenant._id);
    const { clienteId } = await crearClienteVentana(tenant._id, 60 * 60_000);

    await enviarRecordatorio(tenant._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendText).not.toHaveBeenCalled();
  });

  it('idempotencia: dos barridos consecutivos sobre la misma conversación producen un único envío (criterio 7)', async () => {
    const tenant = await crearTenantConRecordatorio();
    await crearIntegracion(tenant._id);
    const { clienteId } = await crearClienteVentana(tenant._id, 60 * 60_000);
    vi.mocked(metaWhatsAppClient.sendText).mockResolvedValue({ messageId: 'wamid.R3' });

    await enviarRecordatorio(tenant._id.toString(), clienteId);
    await enviarRecordatorio(tenant._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendText).toHaveBeenCalledTimes(1);
  });

  it('un inbound nuevo reabre la ventana y la conversación vuelve a ser candidata sin limpiar banderas', async () => {
    const tenantId = new Types.ObjectId();
    const ventanaVieja = new Date(Date.now() + 30 * 60_000);
    const ventanaNueva = new Date(Date.now() + 23 * 60 * 60_000);
    await createScoped(Cliente, tenantId, {
      metaUserId: `wa_reabre_${Math.random()}`,
      telefono: '573000000000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      ventana24hExpiraEn: ventanaVieja,
      recordatorioEnviadoParaVentana: ventanaVieja, // ya se envió para la ventana anterior
      iaHabilitada: true,
      customFields: {},
      tagIds: [],
    });

    // No es candidato: la marca coincide con la ventana actual.
    let candidatos = await buscarCandidatos(new Date());
    expect(candidatos.some((c) => c.tenantId === tenantId.toString())).toBe(false);

    // Llega un inbound nuevo: la ventana se recalcula, la marca queda desactualizada.
    await Cliente.updateMany({ tenantId }, { $set: { ventana24hExpiraEn: ventanaNueva } });

    candidatos = await buscarCandidatos(new Date());
    expect(candidatos.some((c) => c.tenantId === tenantId.toString())).toBe(true);
  });
});

describe('Regla de no duplicar la ventana', () => {
  it('enviarRecordatorio nunca compara ventana24hExpiraEn para elegir el MODO de envío', async () => {
    // Revisión de humo: con la ventana ya vencida y una plantilla aprobada, el modo lo decide
    // `sendOutbound` (HT-WA-02) — esta función solo pasa `modo: 'auto'` y dos strings/objetos de
    // contenido, nunca una comparación de fecha para elegir texto vs plantilla.
    const tenant = await crearTenantConRecordatorio();
    await crearIntegracion(tenant._id);
    const templateId = await crearPlantillaAprobada(tenant._id);
    await Tenant.findByIdAndUpdate(tenant._id, { 'recordatorio.templateId': templateId });
    const { clienteId } = await crearClienteVentana(tenant._id, -60_000);
    vi.mocked(metaWhatsAppClient.sendTemplate).mockResolvedValueOnce({ messageId: 'wamid.R4' });

    await enviarRecordatorio(tenant._id.toString(), clienteId);

    expect(metaWhatsAppClient.sendTemplate).toHaveBeenCalledOnce();
  });
});

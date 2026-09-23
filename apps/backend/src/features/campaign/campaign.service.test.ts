import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { Plan } from '../plan/plan.model.js';
import { TenantUsage } from '../usage/usage.model.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

const getHealth = vi.fn();
vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: { getHealth: (...args: unknown[]) => getHealth(...args) },
}));

import { campaignQueue } from '../../config/queues.js';
import {
  campaignJobId,
  cancelCampaign,
  contarConsumo24h,
  createCampaign,
  getCampaign,
  launchCampaign,
  pauseCampaign,
  resumeCampaign,
} from './campaign.service.js';
import type { LeanCampaign } from './campaign.types.js';

const tenantId = new Types.ObjectId();
const actorId = new Types.ObjectId().toString();

let templateId: string;
let clienteIds: Types.ObjectId[];

async function crearPlantilla(status: 'APPROVED' | 'PENDING', parametrosBody = 0): Promise<string> {
  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: `meta-${status}-${parametrosBody}`,
    name: `plantilla_${status.toLowerCase()}_${parametrosBody}`,
    language: 'es',
    category: 'MARKETING',
    status,
    components: [{ type: 'BODY', text: 'Hola' }],
    parametrosBody,
  });
  return doc._id.toString();
}

async function crearContactos(cantidad: number): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    const doc = await createScoped(Cliente, tenantId, {
      metaUserId: `meta-${i}`,
      telefono: `57300111000${i}`,
      nombre: `Contacto ${i}`,
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      rolContacto: 'estudiante',
      marketingOptOut: false,
    });
    ids.push(doc._id);
  }
  return ids;
}

const datosBase = () => ({
  nombre: 'Promo Pre-ICFES',
  filtros: { rolContacto: ['estudiante'] },
  templateId,
  parametros: [] as string[],
});

describe('HU-MARK-01 — servicio de campañas', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getHealth.mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    });

    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
      Message.deleteMany({}),
      MetaIntegration.deleteMany({}),
      WhatsAppTemplate.deleteMany({}),
      Tenant.deleteMany({}),
      Plan.deleteMany({}),
      TenantUsage.deleteMany({}),
    ]);
    await Promise.all([Campaign.syncIndexes(), CampaignRecipient.syncIndexes()]);

    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });

    templateId = await crearPlantilla('APPROVED');
    clienteIds = await crearContactos(3);
  });

  it('lanzar materializa el segmento y deja `totales.destinatarios` fijo', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });

    expect(campana.estado).toBe('en_curso');
    expect(campana.totales.destinatarios).toBe(3);
    expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(3);
  });

  it('el segmento se CONGELA: un contacto que entra en el filtro después no se incorpora', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });

    await createScoped(Cliente, tenantId, {
      metaUserId: 'meta-tardio',
      telefono: '573009999999',
      nombre: 'Llegó tarde',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      rolContacto: 'estudiante',
      marketingOptOut: false,
    });

    const detalle = await getCampaign(tenantId, campana.id);
    expect(detalle.totales.destinatarios).toBe(3);
    expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(3);
  });

  it('encola el primer lote con un `jobId` sin «:» y que no es un entero puro (trampa de HT-AI-02)', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });

    expect(campaignQueue.add).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(campaignQueue.add).mock.calls[0]![2] as { jobId: string };

    expect(opts.jobId).toBe(campaignJobId(campana.id, 0));
    expect(opts.jobId).not.toContain(':');
    expect(Number.isNaN(Number(opts.jobId))).toBe(true);
  });

  it('una plantilla no APPROVED se rechaza con 422 al crear, sin dejar campaña huérfana', async () => {
    const pendiente = await crearPlantilla('PENDING');

    await expect(
      createCampaign(tenantId, actorId, { ...datosBase(), templateId: pendiente }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(await Campaign.countDocuments({ tenantId })).toBe(0);
  });

  it('un número de parámetros distinto al del cuerpo se rechaza con 400 e indica cuántos se esperaban', async () => {
    const conDos = await crearPlantilla('APPROVED', 2);

    await expect(
      createCampaign(tenantId, actorId, {
        ...datosBase(),
        templateId: conDos,
        parametros: ['solo uno'],
      }),
    ).rejects.toMatchObject({ statusCode: 400, details: { esperados: 2, recibidos: 1 } });
  });

  it('la cuota `campanasMes` agotada devuelve 429 SIN materializar destinatarios', async () => {
    const plan = await Plan.create({
      nombre: 'Básico',
      precio: 0,
      activo: true,
      limites: { usuarios: 3, administradores: 3, mensajesMes: 1000, leads: 500, campanasMes: 1 },
    });
    await Tenant.create({
      _id: tenantId,
      nombre: 'Empresa',
      slug: `empresa-${tenantId.toString()}`,
      contacto: { email: 'a@b.com', telefono: '1' },
      estado: 'activo',
      planId: plan._id,
    });
    await createScoped(TenantUsage, tenantId, {
      periodo: new Date().toISOString().slice(0, 7),
      campanasMes: 1,
    });

    await expect(
      createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true }),
    ).rejects.toMatchObject({ statusCode: 429 });

    expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(0);
  });

  it('con calidad RED no se lanza: 409 y ni un destinatario materializado', async () => {
    getHealth.mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'RED',
      healthStatus: 'LIMITED',
    });

    await expect(
      createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(0);
  });

  it('un segmento sin nadie se rechaza con 422 en vez de arrancar una campaña vacía', async () => {
    await expect(
      createCampaign(tenantId, actorId, {
        ...datosBase(),
        filtros: { rolContacto: ['no-existe'] },
        lanzar: true,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('relanzar una campaña en curso es idempotente: ni duplica destinatarios ni reencola', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });
    vi.mocked(campaignQueue.add).mockClear();

    const relanzada = await launchCampaign(tenantId, actorId, campana.id);

    expect(relanzada.estado).toBe('en_curso');
    expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(3);
    expect(campaignQueue.add).not.toHaveBeenCalled();
  });

  it('pausar y reanudar conserva el progreso: lo ya enviado no vuelve a la cola', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });

    // Simula un lote ya cursado.
    const primero = await CampaignRecipient.findOne({ tenantId }).lean<{ _id: Types.ObjectId }>();
    await CampaignRecipient.updateOne({ _id: primero!._id }, { $set: { estado: 'enviado' } });

    expect((await pauseCampaign(tenantId, actorId, campana.id)).estado).toBe('pausada');
    expect((await resumeCampaign(tenantId, actorId, campana.id)).estado).toBe('en_curso');

    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'enviado' })).toBe(1);
    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'pendiente' })).toBe(2);
  });

  it('pausar algo que no está en curso es un 409, no un cambio silencioso', async () => {
    const borrador = await createCampaign(tenantId, actorId, datosBase());

    await expect(pauseCampaign(tenantId, actorId, borrador.id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('cancelar deja los pendientes en `omitido`, no en `fallido`', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });

    const cancelada = await cancelCampaign(tenantId, actorId, campana.id);

    expect(cancelada.estado).toBe('cancelada');
    expect(cancelada.totales.omitidos).toBe(3);
    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'omitido' })).toBe(3);
    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'fallido' })).toBe(0);
  });

  it('una campaña cancelada no se puede relanzar', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });
    await cancelCampaign(tenantId, actorId, campana.id);

    await expect(launchCampaign(tenantId, actorId, campana.id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('programar deja la campaña en `programada` sin encolar ni materializar', async () => {
    const enUnaHora = new Date(Date.now() + 3_600_000).toISOString();

    const campana = await createCampaign(tenantId, actorId, {
      ...datosBase(),
      programadaPara: enUnaHora,
    });

    expect(campana.estado).toBe('programada');
    expect(campana.programadaPara).toBe(enUnaHora);
    expect(campaignQueue.add).not.toHaveBeenCalled();
    expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(0);
  });

  it('el detalle devuelve los cinco estados del desglose, con 0 los que no tienen a nadie', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });

    const detalle = await getCampaign(tenantId, campana.id);

    expect(detalle.desglose).toEqual({
      pendiente: 3,
      enviado: 0,
      entregado: 0,
      fallido: 0,
      omitido: 0,
    });
    expect(detalle.plantilla?.name).toBe('plantilla_approved_0');
  });

  it('`contarConsumo24h` cuenta destinatarios ÚNICOS, no mensajes', async () => {
    // Dos plantillas al mismo contacto el mismo día son UNA conversación iniciada para Meta.
    for (const [i, clienteId] of [clienteIds[0]!, clienteIds[0]!, clienteIds[1]!].entries()) {
      await createScoped(Message, tenantId, {
        clienteId,
        canal: 'whatsapp',
        direccion: 'outbound',
        sender: 'bot',
        tipo: 'plantilla',
        metaMessageId: `wamid.${i}`,
        status: 'sent',
      });
    }

    expect(await contarConsumo24h(tenantId)).toBe(2);
  });

  it('`contarConsumo24h` ignora lo que cayó fuera de la ventana rodante y el texto libre', async () => {
    await createScoped(Message, tenantId, {
      clienteId: clienteIds[0]!,
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'agent',
      tipo: 'texto',
      status: 'sent',
    });

    const viejo = await createScoped(Message, tenantId, {
      clienteId: clienteIds[1]!,
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'bot',
      tipo: 'plantilla',
      status: 'sent',
    });
    // Por el driver crudo: Mongoose marca `createdAt` como inmutable cuando hay `timestamps`,
    // así que un `updateOne` del modelo se ignoraría en silencio.
    await Message.collection.updateOne(
      { _id: viejo._id },
      { $set: { createdAt: new Date(Date.now() - 25 * 3_600_000) } },
    );

    expect(await contarConsumo24h(tenantId)).toBe(0);
  });

  it('el presupuesto congelado al lanzar queda guardado como auditoría de la cadencia', async () => {
    const campana = await createCampaign(tenantId, actorId, { ...datosBase(), lanzar: true });

    const guardada = await Campaign.findById(campana.id).lean<LeanCampaign>();
    expect(guardada?.presupuesto).toMatchObject({ tier: 'TIER_1K', calidad: 'GREEN', limiteDiario: 800 });
  });
});

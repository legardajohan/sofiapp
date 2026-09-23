import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

// La cola no debe tocar Redis en los tests: solo se comprueba que se encola.
vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

// El sondeo de tier sale a la Graph API: se fija en verde para que el pacing no bloquee.
vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: {
    getHealth: vi.fn().mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    }),
  },
}));

import {
  applyDeliveryStatusToRecipient,
  cancelCampaign,
  createCampaign,
  getCampaign,
  launchCampaign,
  listCampaigns,
  listRecipients,
  pauseCampaign,
  previewSegment,
  resumeCampaign,
} from './campaign.service.js';
import type { LeanCampaign, LeanCampaignRecipient } from './campaign.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const actorA = new Types.ObjectId().toString();
const actorB = new Types.ObjectId().toString();

async function prepararTenant(
  tenantId: Types.ObjectId,
  nombreContacto: string,
): Promise<{ templateId: string }> {
  await createScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
    wabaId: `waba-${tenantId.toString()}`,
    phoneNumberId: `phone-${tenantId.toString()}`,
    accessTokenEnc: encrypt('token'),
    activo: true,
  });

  const plantilla = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: 'meta-1',
    name: 'promo',
    language: 'es',
    category: 'MARKETING',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hola, tenemos una promoción.' }],
    parametrosBody: 0,
  });

  // MISMO teléfono y MISMA clave de atributo en los dos tenants: es el caso que un segmento mal
  // acotado confundiría.
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-${tenantId.toString()}`,
    telefono: '573001110001',
    nombre: nombreContacto,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    rolContacto: 'estudiante',
    marketingOptOut: false,
    atributos: [{ key: 'grado', label: 'Grado', valor: '11', sensible: false }],
  });

  await createScoped(Lead, tenantId, {
    nombre: nombreContacto,
    telefono: '573001110001',
    clienteId: cliente._id,
    origen: {
      tipo: 'conversacion',
      conversacionId: cliente._id,
      convertidoPor: new Types.ObjectId(),
      convertidoAt: new Date(),
    },
    responsableId: new Types.ObjectId(),
    estado: 'nuevo',
    semaforo: 'verde',
  });

  return { templateId: plantilla._id.toString() };
}

describe('HU-MARK-01 — aislamiento multi-tenant de campañas', () => {
  let campanaDeA: string;

  beforeEach(async () => {
    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
      Lead.deleteMany({}),
      MetaIntegration.deleteMany({}),
      WhatsAppTemplate.deleteMany({}),
    ]);
    await Promise.all([Campaign.syncIndexes(), CampaignRecipient.syncIndexes()]);

    const { templateId } = await prepararTenant(tenantA, 'Contacto de A');
    await prepararTenant(tenantB, 'Contacto de B');

    const creada = await createCampaign(tenantA, actorA, {
      nombre: 'Promo de A',
      filtros: { rolContacto: ['estudiante'] },
      templateId,
      parametros: [],
      lanzar: true,
    });
    campanaDeA = creada.id;
  });

  it('el listado del tenantB no incluye la campaña del tenantA', async () => {
    const listadoB = await listCampaigns(tenantB, { page: 1, limit: 20 });
    expect(listadoB.total).toBe(0);

    // Su dueño sí la ve: el vacío de arriba es aislamiento, no un listado roto.
    const listadoA = await listCampaigns(tenantA, { page: 1, limit: 20 });
    expect(listadoA.data.map((c) => c.nombre)).toEqual(['Promo de A']);
  });

  it('el tenantB no puede LEER la campaña del tenantA → 404, nunca 403', async () => {
    await expect(getCampaign(tenantB, campanaDeA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('el tenantB no puede PAUSAR la campaña del tenantA → 404 y NO la toca', async () => {
    await expect(pauseCampaign(tenantB, actorB, campanaDeA)).rejects.toMatchObject({
      statusCode: 404,
    });

    // El 404 no basta: hay que probar que no escribió.
    const intacta = await findByIdScoped(Campaign, tenantA, campanaDeA).lean<LeanCampaign>();
    expect(intacta?.estado).toBe('en_curso');
  });

  it('el tenantB no puede CANCELAR la campaña del tenantA → 404 y sus destinatarios siguen pendientes', async () => {
    await expect(cancelCampaign(tenantB, actorB, campanaDeA)).rejects.toMatchObject({
      statusCode: 404,
    });

    const pendientes = await CampaignRecipient.countDocuments({
      tenantId: tenantA,
      estado: 'pendiente',
    });
    expect(pendientes).toBe(1);
  });

  it('el tenantB no puede REANUDAR ni RELANZAR la campaña del tenantA → 404', async () => {
    await expect(resumeCampaign(tenantB, actorB, campanaDeA)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(launchCampaign(tenantB, actorB, campanaDeA)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('el tenantB no puede listar los destinatarios de la campaña del tenantA → 404, no una página vacía', async () => {
    // Una página vacía sería peor que un 404: confirmaría que el id existe en alguna parte.
    await expect(
      listRecipients(tenantB, campanaDeA, { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('un segmento IDÉNTICO en el tenantB no devuelve contactos del tenantA, con el mismo teléfono y el mismo atributo', async () => {
    const filtros = {
      rolContacto: ['estudiante'],
      atributos: [{ key: 'grado', valores: ['11'] }],
      semaforoLead: ['verde'],
    };

    const enB = await previewSegment(tenantB, filtros);
    expect(enB.total).toBe(1);
    expect(enB.muestra.map((c) => c.nombre)).toEqual(['Contacto de B']);

    const enA = await previewSegment(tenantA, filtros);
    expect(enA.muestra.map((c) => c.nombre)).toEqual(['Contacto de A']);
  });

  it('`createScoped` fuerza el tenant del argumento sobre el que venga en el payload', async () => {
    const doc = await createScoped(Campaign, tenantA, {
      tenantId: tenantB,
      nombre: 'Colada',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: [],
      creadaPor: new Types.ObjectId(actorA),
    });

    expect(String(doc.tenantId)).toBe(tenantA.toString());
  });

  it('los destinatarios materializados llevan el tenant de la campaña, no el del contacto', async () => {
    const destinatarios = await CampaignRecipient.find({ tenantId: tenantA }).lean<
      LeanCampaignRecipient[]
    >();

    expect(destinatarios).toHaveLength(1);
    expect(String(destinatarios[0]!.tenantId)).toBe(tenantA.toString());
    expect(await CampaignRecipient.countDocuments({ tenantId: tenantB })).toBe(0);
  });

  it('un `metaMessageId` del tenantA no se resuelve desde el tenantB (la fuga de HT-WA-01-V2 sigue cerrada)', async () => {
    const destinatario = await CampaignRecipient.findOne({ tenantId: tenantA }).lean<
      LeanCampaignRecipient
    >();
    await CampaignRecipient.updateOne(
      { _id: destinatario!._id },
      { $set: { estado: 'enviado', metaMessageId: 'wamid.COMPARTIDO' } },
    );

    // El mismo id llegando por el webhook del tenantB no puede tocar la fila del tenantA.
    await applyDeliveryStatusToRecipient(tenantB, 'wamid.COMPARTIDO', 'delivered');

    const sinTocar = await findByIdScoped(
      CampaignRecipient,
      tenantA,
      destinatario!._id.toString(),
    ).lean<LeanCampaignRecipient>();
    expect(sinTocar?.estado).toBe('enviado');

    // Y por el camino correcto sí se aplica: el aislamiento no puede romper la funcionalidad.
    await applyDeliveryStatusToRecipient(tenantA, 'wamid.COMPARTIDO', 'delivered');
    const aplicado = await findByIdScoped(
      CampaignRecipient,
      tenantA,
      destinatario!._id.toString(),
    ).lean<LeanCampaignRecipient>();
    expect(aplicado?.estado).toBe('entregado');
  });
});

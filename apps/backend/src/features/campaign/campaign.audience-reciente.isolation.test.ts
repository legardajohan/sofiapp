import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { Lead } from '../lead/lead.model.js';
import { Tag } from '../tag/tag.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: {
    getHealth: vi.fn().mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    }),
  },
}));

import { createCampaign, previewAudience, sendCampaign } from './campaign.service.js';
import { listLeads } from '../lead/lead.service.js';
import { getAjustesTenant, updateAjustesTenant } from '../tenant/tenant.service.js';
import type { LeanCampaign } from './campaign.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const actorA = new Types.ObjectId().toString();
const actorB = new Types.ObjectId().toString();
// MISMO teléfono en los dos tenants: el caso que una audiencia mal acotada confundiría.
const TELEFONO = '573001110001';

async function prepararTenant(tenantId: Types.ObjectId, nombre: string): Promise<string> {
  await Tenant.create({
    _id: tenantId,
    nombre,
    slug: `t-${tenantId.toString()}`,
    contacto: { email: 'a@e.com', telefono: '1' },
  });
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
    components: [{ type: 'BODY', text: 'Hola.' }],
    parametrosBody: 0,
  });
  return plantilla._id.toString();
}

async function contactoConSaliente(tenantId: Types.ObjectId, nombre: string): Promise<Types.ObjectId> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-${tenantId.toString()}`,
    telefono: TELEFONO,
    nombre,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
  });
  await createScoped(Message, tenantId, {
    clienteId: c._id,
    canal: 'whatsapp',
    direccion: 'outbound',
    sender: 'agent',
    tipo: 'texto',
    texto: 'hola',
  });
  return c._id;
}

describe('HU-MARK-07 — aislamiento multi-tenant de la audiencia por mensajes recientes', () => {
  let templateA: string;

  beforeEach(async () => {
    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
      Message.deleteMany({}),
      Lead.deleteMany({}),
      Tag.deleteMany({}),
      Tenant.deleteMany({}),
      MetaIntegration.deleteMany({}),
      WhatsAppTemplate.deleteMany({}),
    ]);
    await Promise.all([Campaign.syncIndexes(), CampaignRecipient.syncIndexes(), Tag.syncIndexes()]);
    templateA = await prepararTenant(tenantA, 'A');
    await prepararTenant(tenantB, 'B');
  });

  it('los salientes del tenant B nunca entran en la audiencia de A', async () => {
    await contactoConSaliente(tenantB, 'Contacto de B');

    const deA = await previewAudience(tenantA, { tipo: 'mensajes_recientes', rango: '1d' });
    expect(deA.total).toBe(0);
    expect(deA.resumen.coinciden).toBe(0);

    // El dueño sí lo ve: el vacío de arriba es aislamiento, no una consulta rota.
    const deB = await previewAudience(tenantB, { tipo: 'mensajes_recientes', rango: '1d' });
    expect(deB.muestra.map((m) => m.nombre)).toEqual(['Contacto de B']);
  });

  it('con el mismo teléfono en los dos tenants, A solo materializa su propio contacto', async () => {
    const deA = await contactoConSaliente(tenantA, 'Contacto de A');
    await contactoConSaliente(tenantB, 'Contacto de B');

    const c = await createCampaign(tenantA, actorA, {
      nombre: 'Seguimiento A',
      filtros: {},
      templateId: templateA,
      parametros: [],
      audiencia: { tipo: 'mensajes_recientes', rango: '1d' },
    });
    await sendCampaign(tenantA, actorA, c.id, {});

    const destinatarios = await CampaignRecipient.find({ campaignId: c.id }).lean();
    expect(destinatarios).toHaveLength(1);
    expect(String(destinatarios[0]?.clienteId)).toBe(deA.toString());
    expect(String(destinatarios[0]?.tenantId)).toBe(tenantA.toString());
  });

  it('`send` sobre una campaña de A desde B → 404 y nada escrito', async () => {
    await contactoConSaliente(tenantA, 'Contacto de A');
    const c = await createCampaign(tenantA, actorA, {
      nombre: 'Seguimiento A',
      filtros: {},
      templateId: templateA,
      parametros: [],
      audiencia: { tipo: 'mensajes_recientes', rango: '1d' },
    });

    await expect(
      sendCampaign(tenantB, actorB, c.id, { etiqueta: { nombre: 'Intrusa' } }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await Tag.countDocuments({})).toBe(0);
    const intacta = await Campaign.findById(c.id).lean<LeanCampaign>();
    expect(intacta?.estado).toBe('borrador');
    expect(intacta?.tagId ?? null).toBeNull();
    expect(await CampaignRecipient.countDocuments({})).toBe(0);
  });

  it('`send` con un tagId del tenant B → 404 y la campaña de A no se lanza', async () => {
    await contactoConSaliente(tenantA, 'Contacto de A');
    const tagDeB = await createScoped(Tag, tenantB, { nombre: 'De B', color: '#112233' });
    const c = await createCampaign(tenantA, actorA, {
      nombre: 'Seguimiento A',
      filtros: {},
      templateId: templateA,
      parametros: [],
      audiencia: { tipo: 'mensajes_recientes', rango: '1d' },
    });

    await expect(
      sendCampaign(tenantA, actorA, c.id, { etiqueta: { tagId: tagDeB._id.toString() } }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect((await Campaign.findById(c.id).lean<LeanCampaign>())?.estado).toBe('borrador');
  });

  it('un nombre igual a una etiqueta de B crea una etiqueta NUEVA en A', async () => {
    await contactoConSaliente(tenantA, 'Contacto de A');
    const tagDeB = await createScoped(Tag, tenantB, { nombre: 'Seguimiento', color: '#112233' });
    const c = await createCampaign(tenantA, actorA, {
      nombre: 'Seguimiento A',
      filtros: {},
      templateId: templateA,
      parametros: [],
      audiencia: { tipo: 'mensajes_recientes', rango: '1d' },
    });

    const r = await sendCampaign(tenantA, actorA, c.id, { etiqueta: { nombre: 'Seguimiento' } });

    expect(r.etiqueta?.id).not.toBe(tagDeB._id.toString());
    expect(await Tag.countDocuments({ tenantId: tenantA })).toBe(1);
    expect(await Tag.countDocuments({ tenantId: tenantB })).toBe(1);
  });

  it('`GET /leads?etiqueta=<tag de B>` desde A devuelve vacío', async () => {
    const tagDeB = await createScoped(Tag, tenantB, { nombre: 'De B', color: '#112233' });
    const deB = await createScoped(Cliente, tenantB, {
      metaUserId: 'meta-b',
      telefono: TELEFONO,
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      tagIds: [tagDeB._id],
    });
    await createScoped(Lead, tenantB, {
      nombre: 'Lead B',
      telefono: TELEFONO,
      clienteId: deB._id,
      origen: {
        tipo: 'conversacion',
        conversacionId: deB._id,
        convertidoPor: new Types.ObjectId(),
        convertidoAt: new Date(),
      },
      responsableId: new Types.ObjectId(),
      estado: 'nuevo',
    });

    const deA = await listLeads(tenantA, { page: 1, limit: 20, etiqueta: tagDeB._id.toString() });
    expect(deA.total).toBe(0);

    const propio = await listLeads(tenantB, { page: 1, limit: 20, etiqueta: tagDeB._id.toString() });
    expect(propio.total).toBe(1);
  });

  it('los ajustes de zona horaria solo tocan el tenant del token', async () => {
    await updateAjustesTenant(tenantA.toString(), { zonaHoraria: 'Europe/Madrid' });

    expect(await getAjustesTenant(tenantA.toString())).toEqual({ zonaHoraria: 'Europe/Madrid' });
    expect(await getAjustesTenant(tenantB.toString())).toEqual({ zonaHoraria: 'America/Bogota' });
  });
});

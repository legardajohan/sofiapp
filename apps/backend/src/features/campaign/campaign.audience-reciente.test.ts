import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
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

import { CAMPAIGN_SCHEDULED_START_JOB, campaignQueue } from '../../config/queues.js';
import { createCampaign, getCampaign, previewAudience, sendCampaign } from './campaign.service.js';
import type { LeanCampaign } from './campaign.types.js';

const tenantId = new Types.ObjectId();
const actorId = new Types.ObjectId().toString();
const HORA = 3_600_000;

interface ContactoSeed {
  nombre: string;
  telefono: string;
  marketingOptOut?: boolean;
  bloqueado?: boolean;
  tagIds?: Types.ObjectId[];
}

async function contacto(seed: ContactoSeed): Promise<Types.ObjectId> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-${seed.nombre}`,
    telefono: seed.telefono,
    nombre: seed.nombre,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    marketingOptOut: seed.marketingOptOut ?? false,
    bloqueado: seed.bloqueado ?? false,
    tagIds: seed.tagIds ?? [],
  });
  return c._id;
}

/** Un mensaje con `createdAt` arbitrario. Por el driver crudo: Mongoose hace inmutable `createdAt`. */
async function mensaje(
  clienteId: Types.ObjectId,
  direccion: 'inbound' | 'outbound',
  haceHoras: number,
): Promise<void> {
  const m = await createScoped(Message, tenantId, {
    clienteId,
    canal: 'whatsapp',
    direccion,
    sender: direccion === 'outbound' ? 'agent' : 'user',
    tipo: 'texto',
    texto: 'hola',
  });
  await Message.collection.updateOne(
    { _id: m._id },
    { $set: { createdAt: new Date(Date.now() - haceHoras * HORA) } },
  );
}

async function plantilla(): Promise<string> {
  const p = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: 'meta-1',
    name: 'promo',
    language: 'es',
    category: 'MARKETING',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hola, tenemos novedades.' }],
    parametrosBody: 0,
  });
  return p._id.toString();
}

async function campanaReciente(templateId: string, rango: '1d' | '3d' | '7d' = '1d'): Promise<string> {
  const c = await createCampaign(tenantId, actorId, {
    nombre: 'Seguimiento',
    filtros: {},
    templateId,
    parametros: [],
    audiencia: { tipo: 'mensajes_recientes', rango },
  });
  return c.id;
}

describe('HU-MARK-07 — audiencia por mensajes recientes', () => {
  let templateId: string;

  beforeEach(async () => {
    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
      Message.deleteMany({}),
      Tag.deleteMany({}),
      Tenant.deleteMany({}),
      MetaIntegration.deleteMany({}),
      WhatsAppTemplate.deleteMany({}),
    ]);
    await Promise.all([
      Campaign.syncIndexes(),
      CampaignRecipient.syncIndexes(),
      Tag.syncIndexes(),
    ]);
    await Tenant.create({
      _id: tenantId,
      nombre: 'Empresa',
      slug: `empresa-${tenantId.toString()}`,
      contacto: { email: 'a@e.com', telefono: '1' },
      zonaHoraria: 'America/Bogota',
    });
    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
    templateId = await plantilla();
  });

  it('un contacto con varios salientes en el rango cuenta UNA vez', async () => {
    const ana = await contacto({ nombre: 'Ana', telefono: '573000000001' });
    await mensaje(ana, 'outbound', 1);
    await mensaje(ana, 'outbound', 2);
    await mensaje(ana, 'outbound', 5);

    const r = await previewAudience(tenantId, { tipo: 'mensajes_recientes', rango: '1d' });
    expect(r.total).toBe(1);
    expect(r.muestra.map((m) => m.nombre)).toEqual(['Ana']);
    expect(r.rango.zonaHoraria).toBe('America/Bogota');
  });

  it('dos fichas con el mismo teléfono son un solo destinatario', async () => {
    const a = await contacto({ nombre: 'Ana', telefono: '573000000001' });
    const b = await contacto({ nombre: 'Ana duplicada', telefono: '573000000001' });
    await mensaje(a, 'outbound', 1);
    await mensaje(b, 'outbound', 1);

    const r = await previewAudience(tenantId, { tipo: 'mensajes_recientes', rango: '1d' });
    expect(r.total).toBe(1);
    expect(r.resumen.duplicados).toBe(1);
  });

  it('los entrantes y los salientes fuera del rango no cuentan', async () => {
    const entrante = await contacto({ nombre: 'Solo escribió', telefono: '573000000001' });
    const viejo = await contacto({ nombre: 'Hace días', telefono: '573000000002' });
    const reciente = await contacto({ nombre: 'Reciente', telefono: '573000000003' });
    await mensaje(entrante, 'inbound', 1);
    await mensaje(viejo, 'outbound', 30);
    await mensaje(reciente, 'outbound', 30);

    const unDia = await previewAudience(tenantId, { tipo: 'mensajes_recientes', rango: '1d' });
    expect(unDia.total).toBe(0);

    const tresDias = await previewAudience(tenantId, { tipo: 'mensajes_recientes', rango: '3d' });
    expect(tresDias.total).toBe(2);
  });

  it('opt-out y bloqueados quedan fuera y se desglosan', async () => {
    const ok = await contacto({ nombre: 'Ok', telefono: '573000000001' });
    const baja = await contacto({ nombre: 'Baja', telefono: '573000000002', marketingOptOut: true });
    const bloq = await contacto({ nombre: 'Bloqueado', telefono: '573000000003', bloqueado: true });
    for (const id of [ok, baja, bloq]) await mensaje(id, 'outbound', 1);

    const r = await previewAudience(tenantId, { tipo: 'mensajes_recientes', rango: '1d' });
    expect(r.total).toBe(1);
    expect(r.resumen).toMatchObject({ coinciden: 3, bajas: 1, bloqueados: 1, validos: 1 });
  });

  it('el rango personalizado fuera de límites responde 400', async () => {
    await expect(
      previewAudience(tenantId, {
        tipo: 'mensajes_recientes',
        rango: 'custom',
        desde: '2020-01-01',
        hasta: '2020-12-31',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('crear congela el rango resuelto y el total previsto', async () => {
    const ana = await contacto({ nombre: 'Ana', telefono: '573000000001' });
    await mensaje(ana, 'outbound', 1);

    const id = await campanaReciente(templateId, '3d');
    const guardada = await Campaign.findById(id).lean<LeanCampaign>();

    expect(guardada?.audiencia).toMatchObject({
      tipo: 'mensajes_recientes',
      rango: '3d',
      zonaHoraria: 'America/Bogota',
    });
    const desde = guardada?.audiencia?.desde?.getTime() ?? 0;
    const hasta = guardada?.audiencia?.hasta?.getTime() ?? 0;
    expect(hasta - desde).toBe(72 * HORA);
    expect(guardada?.totales.destinatarios).toBe(1);
    expect(guardada?.filtros).toMatchObject({});
  });

  it('la previsualización coincide con los destinatarios materializados al enviar', async () => {
    const ids = await Promise.all(
      ['1', '2', '3'].map((n) => contacto({ nombre: `C${n}`, telefono: `57300000000${n}` })),
    );
    for (const id of ids) await mensaje(id, 'outbound', 2);
    await mensaje(ids[0]!, 'outbound', 3); // varios mensajes al mismo
    const baja = await contacto({ nombre: 'Baja', telefono: '573000000009', marketingOptOut: true });
    await mensaje(baja, 'outbound', 1);

    const preview = await previewAudience(tenantId, { tipo: 'mensajes_recientes', rango: '1d' });
    const id = await campanaReciente(templateId);
    const enviada = await sendCampaign(tenantId, actorId, id, {});

    const materializados = await CampaignRecipient.countDocuments({ tenantId, campaignId: id });
    expect(preview.total).toBe(3);
    expect(enviada.totales.destinatarios).toBe(3);
    expect(materializados).toBe(3);
  });

  it('un saliente posterior a crear la campaña NO entra: el rango está congelado', async () => {
    const ana = await contacto({ nombre: 'Ana', telefono: '573000000001' });
    await mensaje(ana, 'outbound', 1);
    const id = await campanaReciente(templateId);

    // Tras crear: alguien nuevo recibe un mensaje "ahora". Su createdAt queda después de `hasta`.
    const nuevo = await contacto({ nombre: 'Nuevo', telefono: '573000000002' });
    const m = await createScoped(Message, tenantId, {
      clienteId: nuevo,
      canal: 'whatsapp',
      direccion: 'outbound',
      sender: 'agent',
      tipo: 'texto',
      texto: 'hola',
    });
    await Message.collection.updateOne(
      { _id: m._id },
      { $set: { createdAt: new Date(Date.now() + 60_000) } },
    );

    await sendCampaign(tenantId, actorId, id, {});
    expect(await CampaignRecipient.countDocuments({ tenantId, campaignId: id })).toBe(1);
  });

  describe('etiqueta al enviar', () => {
    beforeEach(async () => {
      const ana = await contacto({ nombre: 'Ana', telefono: '573000000001' });
      await mensaje(ana, 'outbound', 1);
    });

    it('un nombre nuevo crea la etiqueta con origen campaña y la fija en la campaña', async () => {
      const id = await campanaReciente(templateId);
      const r = await sendCampaign(tenantId, actorId, id, {
        etiqueta: { nombre: 'Campaña Seguimiento - 31/10/2026' },
      });

      const tag = await Tag.findOne({ tenantId }).lean();
      expect(tag).toMatchObject({ nombre: 'Campaña Seguimiento - 31/10/2026', origen: 'campana' });
      expect(String(tag?.campaignId)).toBe(id);
      expect(r.etiqueta?.nombre).toBe('Campaña Seguimiento - 31/10/2026');
      expect(r.estado).toBe('en_curso');
    });

    it('un nombre que ya existe (otra capitalización y acentos) reutiliza la etiqueta', async () => {
      const existente = await createScoped(Tag, tenantId, { nombre: 'Seguimiento Octubre', color: '#112233' });
      const id = await campanaReciente(templateId);

      const r = await sendCampaign(tenantId, actorId, id, { etiqueta: { nombre: 'seguimiento octubre' } });

      expect(await Tag.countDocuments({ tenantId })).toBe(1);
      expect(r.etiqueta?.id).toBe(existente._id.toString());
    });

    it('con un tagId existente lo usa; con uno inexistente responde 404 sin lanzar', async () => {
      const existente = await createScoped(Tag, tenantId, { nombre: 'VIP', color: '#112233' });
      const id = await campanaReciente(templateId);

      await expect(
        sendCampaign(tenantId, actorId, id, { etiqueta: { tagId: new Types.ObjectId().toString() } }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect((await Campaign.findById(id).lean<LeanCampaign>())?.estado).toBe('borrador');

      const r = await sendCampaign(tenantId, actorId, id, { etiqueta: { tagId: existente._id.toString() } });
      expect(r.etiqueta?.id).toBe(existente._id.toString());
    });

    it('enviar dos veces es idempotente: no duplica destinatarios ni cambia la etiqueta', async () => {
      const id = await campanaReciente(templateId);
      await sendCampaign(tenantId, actorId, id, { etiqueta: { nombre: 'Primera' } });
      const otra = await sendCampaign(tenantId, actorId, id, { etiqueta: { nombre: 'Segunda' } });

      expect(otra.etiqueta?.nombre).toBe('Primera');
      expect(await Tag.countDocuments({ tenantId })).toBe(1);
      expect(await CampaignRecipient.countDocuments({ tenantId, campaignId: id })).toBe(1);
    });

    it('el detalle devuelve el filtro aplicado y la etiqueta', async () => {
      const id = await campanaReciente(templateId, '7d');
      await sendCampaign(tenantId, actorId, id, { etiqueta: { nombre: 'Detalle' } });

      const detalle = await getCampaign(tenantId, id);
      expect(detalle.audiencia).toMatchObject({
        tipo: 'mensajes_recientes',
        rango: '7d',
        zonaHoraria: 'America/Bogota',
      });
      expect(detalle.audiencia.desde).not.toBeNull();
      expect(detalle.etiqueta?.nombre).toBe('Detalle');
    });
  });

  describe('programar o lanzar con etiqueta al crear', () => {
    const enUnaHora = (): string => new Date(Date.now() + 3_600_000).toISOString();

    beforeEach(async () => {
      const ana = await contacto({ nombre: 'Ana', telefono: '573000000001' });
      await mensaje(ana, 'outbound', 1);
      vi.mocked(campaignQueue.add).mockClear();
    });

    it('programada: guarda la etiqueta, encola el arranque exacto y no materializa todavía', async () => {
      const programadaPara = enUnaHora();
      const r = await createCampaign(tenantId, actorId, {
        nombre: 'Seguimiento',
        filtros: {},
        templateId,
        parametros: [],
        audiencia: { tipo: 'mensajes_recientes', rango: '1d' },
        programadaPara,
        etiqueta: { nombre: 'Seguimiento noviembre' },
      });

      expect(r).toMatchObject({ estado: 'programada', programadaPara });
      expect(r.etiqueta?.nombre).toBe('Seguimiento noviembre');
      const tag = await Tag.findOne({ tenantId }).lean();
      expect(String(tag?.campaignId)).toBe(r.id);
      expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(0);

      const llamadas = vi.mocked(campaignQueue.add).mock.calls;
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0]?.[0]).toBe(CAMPAIGN_SCHEDULED_START_JOB);
      expect(llamadas[0]?.[1]).toMatchObject({ campaignId: r.id, programadaParaMs: Date.parse(programadaPara) });
    });

    it('un tagId inexistente responde 404 sin crear la campaña', async () => {
      await expect(
        createCampaign(tenantId, actorId, {
          nombre: 'Seguimiento',
          filtros: {},
          templateId,
          parametros: [],
          audiencia: { tipo: 'mensajes_recientes', rango: '1d' },
          programadaPara: enUnaHora(),
          etiqueta: { tagId: new Types.ObjectId().toString() },
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(await Campaign.countDocuments({ tenantId })).toBe(0);
      expect(campaignQueue.add).not.toHaveBeenCalled();
    });

    it('lanzar ahora con etiqueta en la misma petición la deja en curso y etiquetada', async () => {
      const r = await createCampaign(tenantId, actorId, {
        nombre: 'Seguimiento',
        filtros: {},
        templateId,
        parametros: [],
        audiencia: { tipo: 'mensajes_recientes', rango: '1d' },
        lanzar: true,
        etiqueta: { nombre: 'Ya' },
      });

      expect(r.estado).toBe('en_curso');
      expect(r.etiqueta?.nombre).toBe('Ya');
      expect(await CampaignRecipient.countDocuments({ tenantId, campaignId: r.id })).toBe(1);
    });
  });
});

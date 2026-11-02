import { describe, it, expect, beforeEach, vi } from 'vitest';

// Igual que en `lead.service.test.ts`: sin este mock `publishRealtime` abre Redis y cuelga el test.
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tag } from '../tag/tag.model.js';
import { User } from '../users/user.model.js';
import { Campaign } from '../campaign/campaign.model.js';
import { CampaignRecipient } from '../campaign/campaign-recipient.model.js';
import type { EstadoDestinatario } from '../campaign/campaign.types.js';
import { Lead } from './lead.model.js';
import { createLeadFromConversation, getLeadById, listLeads } from './lead.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

async function crearCliente(
  tenantId: Types.ObjectId,
  telefono: string,
  tagIds: Types.ObjectId[] = [],
): Promise<Types.ObjectId> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${telefono}`,
    telefono,
    nombre: 'Ana',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    tagIds,
  });
  return doc._id;
}

async function crearTag(
  tenantId: Types.ObjectId,
  nombre: string,
  extra: { origen?: 'manual' | 'campana'; campaignId?: Types.ObjectId } = {},
): Promise<Types.ObjectId> {
  const doc = await createScoped(Tag, tenantId, { nombre, color: '#112233', ...extra });
  return doc._id;
}

async function crearCampana(
  tenantId: Types.ObjectId,
  nombre: string,
  tagId: Types.ObjectId | null,
): Promise<Types.ObjectId> {
  const doc = await createScoped(Campaign, tenantId, {
    nombre,
    filtros: {},
    templateId: new Types.ObjectId(),
    parametros: [],
    estado: 'completada',
    tagId,
    creadaPor: new Types.ObjectId(),
  });
  return doc._id;
}

async function destinatario(
  tenantId: Types.ObjectId,
  campaignId: Types.ObjectId,
  clienteId: Types.ObjectId,
  estado: EstadoDestinatario,
  etiquetaAgregada: boolean | null,
  enviadoAt: Date | null,
): Promise<void> {
  await createScoped(CampaignRecipient, tenantId, {
    campaignId,
    clienteId,
    telefono: '573000000001',
    estado,
    enviadoAt,
    etiquetaAgregada,
  });
}

describe('HU-MARK-07 — etiquetas y campañas en el lead', () => {
  let asesorId: string;

  beforeEach(async () => {
    await Promise.all([
      Lead.deleteMany({}),
      Cliente.deleteMany({}),
      Tag.deleteMany({}),
      User.deleteMany({}),
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
    ]);
    const asesor = await createScoped(User, tenantA, {
      nombre: 'Carolina',
      email: 'carolina@empresa.test',
      passwordHash: 'x',
      rol: 'admin',
      activo: true,
    });
    asesorId = String(asesor._id);
  });

  async function leadCon(clienteId: Types.ObjectId): Promise<string> {
    const lead = await createLeadFromConversation(tenantA.toString(), asesorId, {
      nombre: 'Ana Pérez',
      telefono: '573000000001',
      clienteId: String(clienteId),
    });
    return lead.id;
  }

  it('la ficha y el listado traen las etiquetas manuales Y las que dejó la campaña', async () => {
    const vip = await crearTag(tenantA, 'VIP');
    const campanaId = new Types.ObjectId();
    const deCampana = await crearTag(tenantA, 'Campaña Promo - 01/11/2026', {
      origen: 'campana',
      campaignId: campanaId,
    });
    const clienteId = await crearCliente(tenantA, '573000000001', [vip, deCampana]);
    const leadId = await leadCon(clienteId);

    const ficha = await getLeadById(tenantA.toString(), leadId);
    expect(ficha.etiquetas.map((t) => t.nombre)).toEqual(['VIP', 'Campaña Promo - 01/11/2026']);
    expect(ficha.etiquetas[1]).toMatchObject({ origen: 'campana', campaignId: String(campanaId) });

    const listado = await listLeads(tenantA.toString(), { page: 1, limit: 20 });
    expect(listado.data[0]?.etiquetas.map((t) => t.nombre)).toEqual([
      'VIP',
      'Campaña Promo - 01/11/2026',
    ]);
  });

  it('la ficha lista las campañas que recibió, con la etiqueta solo si le llegó', async () => {
    const tag = await crearTag(tenantA, 'Seguimiento');
    const clienteId = await crearCliente(tenantA, '573000000001', [tag]);
    const leadId = await leadCon(clienteId);

    const conEtiqueta = await crearCampana(tenantA, 'Promo noviembre', tag);
    const fallida = await crearCampana(tenantA, 'Promo octubre', tag);
    const sinEtiqueta = await crearCampana(tenantA, 'Aviso', null);
    await destinatario(tenantA, conEtiqueta, clienteId, 'entregado', true, new Date('2026-11-01T10:00:00Z'));
    await destinatario(tenantA, fallida, clienteId, 'fallido', false, new Date('2026-10-01T10:00:00Z'));
    await destinatario(tenantA, sinEtiqueta, clienteId, 'enviado', null, new Date('2026-09-01T10:00:00Z'));

    const ficha = await getLeadById(tenantA.toString(), leadId);

    expect(ficha.campanas).toEqual([
      {
        id: String(conEtiqueta),
        nombre: 'Promo noviembre',
        estado: 'entregado',
        enviadoAt: '2026-11-01T10:00:00.000Z',
        etiqueta: { id: String(tag), nombre: 'Seguimiento', color: '#112233' },
      },
      expect.objectContaining({ nombre: 'Promo octubre', estado: 'fallido', etiqueta: null }),
      expect.objectContaining({ nombre: 'Aviso', estado: 'enviado', etiqueta: null }),
    ]);
  });

  it('aislamiento: ni etiquetas ni campañas de otro tenant entran en la ficha', async () => {
    const clienteId = await crearCliente(tenantA, '573000000001');
    const leadId = await leadCon(clienteId);

    // Mismo `clienteId` en el tenant B: un recipient y una campaña que NO son de A.
    const campanaB = await crearCampana(tenantB, 'Campaña de B', null);
    await destinatario(tenantB, campanaB, clienteId, 'enviado', null, new Date());
    // Un tag de B colado en los `tagIds` del contacto de A no se resuelve: no es del tenant.
    const tagB = await crearTag(tenantB, 'Secreto de B');
    await Cliente.updateOne({ _id: clienteId }, { $push: { tagIds: tagB } });

    const ficha = await getLeadById(tenantA.toString(), leadId);
    expect(ficha.campanas).toEqual([]);
    expect(ficha.etiquetas).toEqual([]);

    const listado = await listLeads(tenantA.toString(), { page: 1, limit: 20 });
    expect(listado.data[0]?.etiquetas).toEqual([]);
  });
});

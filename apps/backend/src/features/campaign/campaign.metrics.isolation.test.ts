/**
 * HU-MARK-04 — aislamiento multi-tenant de las métricas (criterio 8).
 *
 * El caso peligroso es el mismo `metaMessageId` o el mismo contacto "lógico" en dos empresas: una
 * búsqueda de atribución sin tenant marcaría al destinatario equivocado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

import {
  getCampaignMetrics,
  getCampaignsOverview,
  registrarConversionCampana,
  registrarLectura,
  registrarRespuestaCampana,
} from './campaign.metrics.service.js';
import type { LeanCampaignRecipient } from './campaign.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

interface IEscenario {
  campaignId: Types.ObjectId;
  clienteId: Types.ObjectId;
  destinatarioId: Types.ObjectId;
}

async function sembrar(tenantId: Types.ObjectId): Promise<IEscenario> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa-${tenantId.toString()}`,
    telefono: '573001110001',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
  });
  const campana = await createScoped(Campaign, tenantId, {
    nombre: `Promo ${tenantId.toString()}`,
    templateId: new Types.ObjectId(),
    parametros: [],
    estado: 'en_curso',
    creadaPor: new Types.ObjectId(),
    iniciadaAt: new Date(),
  });
  const destinatario = await createScoped(CampaignRecipient, tenantId, {
    campaignId: campana._id,
    clienteId: cliente._id,
    telefono: '573001110001',
    estado: 'enviado',
    // MISMO id de Meta en los dos tenants: es justo lo que HT-WA-01-V2 no deja confundir.
    metaMessageId: 'wamid.compartido',
    enviadoAt: new Date(Date.now() - 3_600_000),
  });
  return {
    campaignId: campana._id as Types.ObjectId,
    clienteId: cliente._id as Types.ObjectId,
    destinatarioId: destinatario._id as Types.ObjectId,
  };
}

async function leer(tenantId: Types.ObjectId, id: Types.ObjectId): Promise<LeanCampaignRecipient> {
  const doc = await findByIdScoped(CampaignRecipient, tenantId, id).lean<LeanCampaignRecipient>();
  if (!doc) throw new Error('no encontrado');
  return doc;
}

describe('HU-MARK-04 — aislamiento multi-tenant de las métricas', () => {
  let a: IEscenario;
  let b: IEscenario;

  beforeEach(async () => {
    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
    ]);
    await CampaignRecipient.syncIndexes();
    a = await sembrar(tenantA);
    b = await sembrar(tenantB);
  });

  it('las métricas de una campaña de B pedidas por A → 404', async () => {
    await expect(getCampaignMetrics(tenantA, b.campaignId.toString())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('el resumen de A no suma campañas de B', async () => {
    const o = await getCampaignsOverview(tenantA, {
      desde: new Date(Date.now() - 86_400_000),
      hasta: new Date(),
    });
    expect(o.totalCampanas).toBe(1);
    expect(o.destinatarios).toBe(1);
    expect(o.campanas.map((c) => c.id)).toEqual([a.campaignId.toString()]);
  });

  it('un `read` de A con el mismo metaMessageId no toca al destinatario de B', async () => {
    await registrarLectura(tenantA, 'wamid.compartido', new Date());

    expect((await leer(tenantA, a.destinatarioId)).leidoAt).toBeInstanceOf(Date);
    const deB = await leer(tenantB, b.destinatarioId);
    expect(deB.leidoAt).toBeNull();
    expect(deB.estado).toBe('enviado');
  });

  it('una respuesta o una conversión en A con el clienteId de B no marca nada en B', async () => {
    // El clienteId de B usado con el tenant de A: la búsqueda scoped no lo encuentra.
    await registrarRespuestaCampana(tenantA, b.clienteId.toString(), new Date());
    await registrarConversionCampana(tenantA, b.clienteId.toString(), new Date());

    const deB = await leer(tenantB, b.destinatarioId);
    expect(deB.respondidoAt).toBeNull();
    expect(deB.convertidoAt).toBeNull();
  });
});

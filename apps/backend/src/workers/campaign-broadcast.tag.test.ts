import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../repositories/base.repository.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Campaign } from '../features/campaign/campaign.model.js';
import { CampaignRecipient } from '../features/campaign/campaign-recipient.model.js';

vi.mock('../config/queues.js', async (original) => {
  const real = await original<typeof import('../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

const sendOutbound = vi.fn();
vi.mock('../features/message/message.service.js', () => ({
  sendOutbound: (...args: unknown[]) => sendOutbound(...args),
}));

vi.mock('../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn() }));

const resolverPresupuesto = vi.fn();
vi.mock('../features/campaign/campaign.service.js', async (original) => {
  const real = await original<typeof import('../features/campaign/campaign.service.js')>();
  return { ...real, resolverPresupuesto: () => resolverPresupuesto() };
});

import { processCampaignJob } from './campaign-broadcast.processor.js';
import { applyDeliveryStatusToRecipient } from '../features/campaign/campaign.service.js';
import type { LeanCampaignRecipient } from '../features/campaign/campaign.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const tagId = new Types.ObjectId();

const PRESUPUESTO = {
  tier: 'TIER_1K' as const,
  calidad: 'GREEN' as const,
  limiteDiario: 800,
  consumido24h: 0,
  disponible: 800,
  intervaloMs: 0,
  bloqueado: false,
  motivoBloqueo: null,
};

async function cliente(
  tenantId: Types.ObjectId,
  n: number,
  tagIds: Types.ObjectId[] = [],
): Promise<Types.ObjectId> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-${tenantId.toString()}-${n}`,
    telefono: `57300111000${n}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    tagIds,
  });
  return c._id;
}

async function campana(clienteIds: Types.ObjectId[]): Promise<Types.ObjectId> {
  const c = await createScoped(Campaign, tenantA, {
    nombre: 'Seguimiento',
    filtros: {},
    templateId: new Types.ObjectId(),
    parametros: [],
    estado: 'en_curso',
    creadaPor: new Types.ObjectId(),
    tagId,
    totales: { destinatarios: clienteIds.length, enviados: 0, entregados: 0, fallidos: 0, omitidos: 0 },
  });
  for (const [i, clienteId] of clienteIds.entries()) {
    await createScoped(CampaignRecipient, tenantA, {
      campaignId: c._id,
      clienteId,
      telefono: `57300111000${i}`,
      estado: 'pendiente',
    });
  }
  return c._id;
}

async function tagsDe(clienteId: Types.ObjectId): Promise<string[]> {
  const c = await Cliente.findById(clienteId).lean<{ tagIds: Types.ObjectId[] }>();
  return (c?.tagIds ?? []).map(String);
}

describe('HU-MARK-07 — etiquetado de destinatarios en el worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resolverPresupuesto.mockResolvedValue(PRESUPUESTO);
    let n = 0;
    sendOutbound.mockImplementation(() => Promise.resolve({ metaMessageId: `wamid.${(n += 1)}` }));
    await Promise.all([Campaign.deleteMany({}), CampaignRecipient.deleteMany({}), Cliente.deleteMany({})]);
    await Promise.all([Campaign.syncIndexes(), CampaignRecipient.syncIndexes()]);
  });

  it('etiqueta solo a los enviados con éxito, nunca a los fallidos', async () => {
    const ok = await cliente(tenantA, 1);
    const falla = await cliente(tenantA, 2);
    sendOutbound
      .mockResolvedValueOnce({ metaMessageId: 'wamid.ok' })
      .mockRejectedValueOnce(new Error('Número no registrado.'));

    const campaignId = await campana([ok, falla]);
    await processCampaignJob({ tenantId: tenantA.toString(), campaignId: campaignId.toString(), lote: 0 });

    expect(await tagsDe(ok)).toEqual([tagId.toString()]);
    expect(await tagsDe(falla)).toEqual([]);

    const fallido = await CampaignRecipient.findOne({ clienteId: falla }).lean<LeanCampaignRecipient>();
    expect(fallido?.estado).toBe('fallido');
    expect(fallido?.etiquetaAgregada ?? null).toBeNull();
  });

  it('no duplica la etiqueta si el contacto ya la tenía', async () => {
    const yaLaTenia = await cliente(tenantA, 1, [tagId]);
    const campaignId = await campana([yaLaTenia]);

    await processCampaignJob({ tenantId: tenantA.toString(), campaignId: campaignId.toString(), lote: 0 });

    expect(await tagsDe(yaLaTenia)).toEqual([tagId.toString()]);
    const r = await CampaignRecipient.findOne({ clienteId: yaLaTenia }).lean<LeanCampaignRecipient>();
    expect(r?.etiquetaAgregada).toBe(false);
  });

  it('un `failed` tardío retira la etiqueta solo si la puso este envío', async () => {
    const nuevo = await cliente(tenantA, 1);
    const yaLaTenia = await cliente(tenantA, 2, [tagId]);
    sendOutbound
      .mockResolvedValueOnce({ metaMessageId: 'wamid.nuevo' })
      .mockResolvedValueOnce({ metaMessageId: 'wamid.viejo' });

    const campaignId = await campana([nuevo, yaLaTenia]);
    await processCampaignJob({ tenantId: tenantA.toString(), campaignId: campaignId.toString(), lote: 0 });

    await applyDeliveryStatusToRecipient(tenantA, 'wamid.nuevo', 'failed');
    await applyDeliveryStatusToRecipient(tenantA, 'wamid.viejo', 'failed');

    expect(await tagsDe(nuevo)).toEqual([]);
    expect(await tagsDe(yaLaTenia)).toEqual([tagId.toString()]);
  });

  it('aislamiento: el job del tenant A nunca etiqueta contactos del tenant B', async () => {
    const deA = await cliente(tenantA, 1);
    const deB = await cliente(tenantB, 1);
    // Un destinatario de A que apunta (por error o manipulación) a un contacto de B.
    const campaignId = await campana([deA, deB]);

    await processCampaignJob({ tenantId: tenantA.toString(), campaignId: campaignId.toString(), lote: 0 });

    expect(await tagsDe(deA)).toEqual([tagId.toString()]);
    expect(await tagsDe(deB)).toEqual([]);
  });
});

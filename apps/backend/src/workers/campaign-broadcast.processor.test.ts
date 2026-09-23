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

// `sendOutbound` es la frontera con Meta: se simula para poder probar el pacing sin red.
const sendOutbound = vi.fn();
vi.mock('../features/message/message.service.js', () => ({
  sendOutbound: (...args: unknown[]) => sendOutbound(...args),
}));

const publishRealtime = vi.fn();
vi.mock('../realtime/realtime.publisher.js', () => ({
  publishRealtime: (...args: unknown[]) => publishRealtime(...args),
}));

// Presupuesto controlado desde el test: el worker no debe depender del canal real.
const resolverPresupuesto = vi.fn();
vi.mock('../features/campaign/campaign.service.js', async (original) => {
  const real = await original<typeof import('../features/campaign/campaign.service.js')>();
  return { ...real, resolverPresupuesto: () => resolverPresupuesto() };
});

import { campaignQueue } from '../config/queues.js';
import { processCampaignJob } from './campaign-broadcast.processor.js';
import type { LeanCampaign } from '../features/campaign/campaign.types.js';

const tenantId = new Types.ObjectId();

function presupuesto(disponible: number, limiteDiario = 800) {
  return {
    tier: 'TIER_1K' as const,
    calidad: 'GREEN' as const,
    limiteDiario,
    consumido24h: limiteDiario - disponible,
    disponible,
    // 0 ms: el bucle no debe dormir de verdad en los tests.
    intervaloMs: 0,
    bloqueado: disponible <= 0,
    motivoBloqueo: null,
  };
}

async function crearCampana(
  estado: LeanCampaign['estado'],
  destinatarios: number,
): Promise<Types.ObjectId> {
  const campana = await createScoped(Campaign, tenantId, {
    nombre: 'Promo',
    filtros: {},
    templateId: new Types.ObjectId(),
    parametros: [],
    estado,
    creadaPor: new Types.ObjectId(),
    totales: { destinatarios, enviados: 0, entregados: 0, fallidos: 0, omitidos: 0 },
  });

  for (let i = 0; i < destinatarios; i += 1) {
    const cliente = await createScoped(Cliente, tenantId, {
      metaUserId: `meta-${i}`,
      telefono: `57300111000${i}`,
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
    });
    await createScoped(CampaignRecipient, tenantId, {
      campaignId: campana._id,
      clienteId: cliente._id,
      telefono: cliente.telefono,
      estado: 'pendiente',
    });
  }

  return campana._id;
}

function job(campaignId: Types.ObjectId, lote = 0) {
  return { tenantId: tenantId.toString(), campaignId: campaignId.toString(), lote };
}

describe('HU-MARK-01 — worker de difusión de campañas', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    sendOutbound.mockImplementation(() =>
      Promise.resolve({ metaMessageId: `wamid.${Math.random()}` }),
    );
    resolverPresupuesto.mockResolvedValue(presupuesto(800));

    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
    ]);
    await Promise.all([Campaign.syncIndexes(), CampaignRecipient.syncIndexes()]);
  });

  it('envía el lote, marca `enviado` con su `metaMessageId` y suma los totales', async () => {
    const campaignId = await crearCampana('en_curso', 3);

    await processCampaignJob(job(campaignId));

    expect(sendOutbound).toHaveBeenCalledTimes(3);
    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'enviado' })).toBe(3);

    const campana = await Campaign.findById(campaignId).lean<LeanCampaign>();
    expect(campana?.totales.enviados).toBe(3);

    const conId = await CampaignRecipient.findOne({ tenantId }).lean<{ metaMessageId: string }>();
    expect(conId?.metaMessageId).toMatch(/^wamid\./);
  });

  it('NUNCA envía más de lo disponible, aunque queden más destinatarios', async () => {
    resolverPresupuesto.mockResolvedValue(presupuesto(2));
    const campaignId = await crearCampana('en_curso', 5);

    await processCampaignJob(job(campaignId));

    // El cupo manda sobre el tamaño de lote y sobre el número de pendientes.
    expect(sendOutbound).toHaveBeenCalledTimes(2);
    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'pendiente' })).toBe(3);

    // Y la campaña sigue viva: agotar el cupo del día es lo normal, no un error.
    const campana = await Campaign.findById(campaignId).lean<LeanCampaign>();
    expect(campana?.estado).toBe('en_curso');
    expect(campaignQueue.add).toHaveBeenCalledTimes(1);
  });

  it('sin cupo no envía nada y se reencola para más tarde, sin fallar', async () => {
    resolverPresupuesto.mockResolvedValue(presupuesto(0));
    const campaignId = await crearCampana('en_curso', 3);

    await processCampaignJob(job(campaignId));

    expect(sendOutbound).not.toHaveBeenCalled();
    expect(campaignQueue.add).toHaveBeenCalledTimes(1);

    const [, , opts] = vi.mocked(campaignQueue.add).mock.calls[0]! as unknown as [
      string,
      unknown,
      { delay: number },
    ];
    expect(opts.delay).toBeGreaterThan(0);

    const campana = await Campaign.findById(campaignId).lean<LeanCampaign>();
    expect(campana?.estado).toBe('en_curso');
  });

  it('un destinatario que falla no tumba el lote: se marca `fallido` con su motivo y sigue', async () => {
    sendOutbound
      .mockResolvedValueOnce({ metaMessageId: 'wamid.1' })
      .mockRejectedValueOnce(new Error('Número no registrado en WhatsApp.'))
      .mockResolvedValueOnce({ metaMessageId: 'wamid.3' });

    const campaignId = await crearCampana('en_curso', 3);

    await processCampaignJob(job(campaignId));

    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'enviado' })).toBe(2);
    const fallido = await CampaignRecipient.findOne({ tenantId, estado: 'fallido' }).lean<{
      error: string;
    }>();
    expect(fallido?.error).toBe('Número no registrado en WhatsApp.');

    const campana = await Campaign.findById(campaignId).lean<LeanCampaign>();
    expect(campana?.totales).toMatchObject({ enviados: 2, fallidos: 1 });
  });

  it('sin pendientes cierra la campaña como `completada` si hubo envíos', async () => {
    const campaignId = await crearCampana('en_curso', 0);
    await Campaign.updateOne({ _id: campaignId }, { $set: { 'totales.enviados': 5 } });

    await processCampaignJob(job(campaignId));

    const campana = await Campaign.findById(campaignId).lean<LeanCampaign>();
    expect(campana?.estado).toBe('completada');
    expect(campana?.finalizadaAt).toBeInstanceOf(Date);
    expect(campaignQueue.add).not.toHaveBeenCalled();
  });

  it('sin pendientes y sin un solo envío cierra como `fallida`, no como completada', async () => {
    const campaignId = await crearCampana('en_curso', 0);

    await processCampaignJob(job(campaignId));

    const campana = await Campaign.findById(campaignId).lean<LeanCampaign>();
    expect(campana?.estado).toBe('fallida');
    expect(campana?.motivo).toMatch(/Ningún destinatario/);
  });

  it('una campaña pausada sale sin enviar y SIN reencolar', async () => {
    const campaignId = await crearCampana('pausada', 3);

    await processCampaignJob(job(campaignId));

    expect(sendOutbound).not.toHaveBeenCalled();
    expect(campaignQueue.add).not.toHaveBeenCalled();
    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'pendiente' })).toBe(3);
  });

  it('una campaña cancelada tampoco se procesa', async () => {
    const campaignId = await crearCampana('cancelada', 3);

    await processCampaignJob(job(campaignId));

    expect(sendOutbound).not.toHaveBeenCalled();
    expect(campaignQueue.add).not.toHaveBeenCalled();
  });

  it('emite `campaign:progress` al room del tenant una vez por lote, no por destinatario', async () => {
    const campaignId = await crearCampana('en_curso', 3);

    await processCampaignJob(job(campaignId));

    expect(publishRealtime).toHaveBeenCalledTimes(1);
    expect(publishRealtime).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'campaign:progress',
        tenantId: tenantId.toString(),
        campaignId: campaignId.toString(),
      }),
    );
  });

  it('el `jobId` del siguiente lote no lleva «:» ni es un entero puro', async () => {
    const campaignId = await crearCampana('en_curso', 3);
    resolverPresupuesto.mockResolvedValue(presupuesto(1));

    await processCampaignJob(job(campaignId, 7));

    const [, , opts] = vi.mocked(campaignQueue.add).mock.calls[0]! as unknown as [
      string,
      unknown,
      { jobId: string },
    ];
    expect(opts.jobId).not.toContain(':');
    expect(Number.isNaN(Number(opts.jobId))).toBe(true);
    expect(opts.jobId).toContain(`-8`);
  });

  it('una campaña que ya no existe no rompe el worker', async () => {
    await expect(processCampaignJob(job(new Types.ObjectId()))).resolves.toBeUndefined();
    expect(sendOutbound).not.toHaveBeenCalled();
  });
});

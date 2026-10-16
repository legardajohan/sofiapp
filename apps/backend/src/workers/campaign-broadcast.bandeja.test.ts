/**
 * HU-MARK-05 — lo que el worker de campañas hace por la bandeja: personalizar por destinatario,
 * ligar el mensaje a la campaña y avisar en vivo sin que un fallo del aviso cuente como envío
 * fallido.
 */
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

const notificarSaliente = vi.fn();
vi.mock('../features/conversation/conversation.service.js', () => ({
  notificarSaliente: (...args: unknown[]) => notificarSaliente(...args),
}));

vi.mock('../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn() }));

const resolverPresupuesto = vi.fn();
const prepararImagenCabecera = vi.fn();
vi.mock('../features/campaign/campaign.service.js', async (original) => {
  const real = await original<typeof import('../features/campaign/campaign.service.js')>();
  return {
    ...real,
    resolverPresupuesto: () => resolverPresupuesto(),
    prepararImagenCabecera: () => prepararImagenCabecera(),
  };
});

import { processCampaignJob } from './campaign-broadcast.processor.js';

const tenantId = new Types.ObjectId();

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

async function crearDestinatario(
  campaignId: Types.ObjectId,
  nombre: string | undefined,
  i: number,
): Promise<string> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-b-${i}`,
    telefono: `57300222000${i}`,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ...(nombre ? { nombre } : {}),
  });
  await createScoped(CampaignRecipient, tenantId, {
    campaignId,
    clienteId: cliente._id,
    telefono: cliente.telefono,
    estado: 'pendiente',
  });
  return String(cliente._id);
}

describe('HU-MARK-05 — worker de campañas y bandeja', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    sendOutbound.mockImplementation(() =>
      Promise.resolve({ _id: new Types.ObjectId(), metaMessageId: `wamid.${Math.random()}` }),
    );
    notificarSaliente.mockResolvedValue(undefined);
    resolverPresupuesto.mockResolvedValue(PRESUPUESTO);
    prepararImagenCabecera.mockResolvedValue(undefined);
    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
    ]);
  });

  it('resuelve el nombre de cada destinatario y usa el respaldo si no lo tiene', async () => {
    const campana = await createScoped(Campaign, tenantId, {
      nombre: 'Promo',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: ['estudiante', 'sábado'],
      parametrosDinamicos: [{ indice: 0, campo: 'nombre' }],
      estado: 'en_curso',
      creadaPor: new Types.ObjectId(),
      totales: { destinatarios: 2, enviados: 0, entregados: 0, fallidos: 0, omitidos: 0 },
    });
    const conNombre = await crearDestinatario(campana._id, 'Ana', 0);
    const sinNombre = await crearDestinatario(campana._id, undefined, 1);

    await processCampaignJob({
      tenantId: tenantId.toString(),
      campaignId: campana._id.toString(),
      lote: 0,
    });

    const parametrosPara = (clienteId: string): unknown =>
      (sendOutbound.mock.calls.find((c) => c[1] === clienteId)?.[2] as { parametros: string[] })
        ?.parametros;
    expect(parametrosPara(conNombre)).toEqual(['Ana', 'sábado']);
    expect(parametrosPara(sinNombre)).toEqual(['estudiante', 'sábado']);
  });

  it('liga cada envío a la campaña, pasa la imagen guardada y avisa a la bandeja', async () => {
    prepararImagenCabecera.mockResolvedValue({ metaMediaId: 'meta-img' });
    const campana = await createScoped(Campaign, tenantId, {
      nombre: 'Con imagen',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: [],
      contenido: {
        imagen: { mediaKey: 'campaigns/c/imagen.png', mimeType: 'image/png', tamanoBytes: 900 },
      },
      estado: 'en_curso',
      creadaPor: new Types.ObjectId(),
      totales: { destinatarios: 1, enviados: 0, entregados: 0, fallidos: 0, omitidos: 0 },
    });
    const clienteId = await crearDestinatario(campana._id, 'Ana', 0);

    await processCampaignJob({
      tenantId: tenantId.toString(),
      campaignId: campana._id.toString(),
      lote: 0,
    });

    expect(sendOutbound).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId,
      expect.objectContaining({ imagenCabecera: { metaMediaId: 'meta-img' } }),
      'bot',
      {
        campaignId: campana._id.toString(),
        mediaCabecera: { mediaKey: 'campaigns/c/imagen.png', mimeType: 'image/png', tamanoBytes: 900 },
      },
    );
    expect(notificarSaliente).toHaveBeenCalledTimes(1);
    expect(notificarSaliente.mock.calls[0]?.[1]).toBe(clienteId);
  });

  it('si avisar a la bandeja falla, el destinatario sigue enviado', async () => {
    notificarSaliente.mockRejectedValue(new Error('Redis caído'));
    const campana = await createScoped(Campaign, tenantId, {
      nombre: 'Promo',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: [],
      estado: 'en_curso',
      creadaPor: new Types.ObjectId(),
      totales: { destinatarios: 1, enviados: 0, entregados: 0, fallidos: 0, omitidos: 0 },
    });
    await crearDestinatario(campana._id, 'Ana', 0);

    await processCampaignJob({
      tenantId: tenantId.toString(),
      campaignId: campana._id.toString(),
      lote: 0,
    });

    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'enviado' })).toBe(1);
    expect(await CampaignRecipient.countDocuments({ tenantId, estado: 'fallido' })).toBe(0);
    const recargada = await Campaign.findById(campana._id).lean();
    expect(recargada?.totales.enviados).toBe(1);
    expect(recargada?.totales.fallidos).toBe(0);
  });
});

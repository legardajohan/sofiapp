/**
 * HU-MARK-03 — arranque exacto de campañas programadas y envío con imagen de cabecera.
 *
 * `launchCampaign` y `prepararImagenCabecera` se simulan: lo que se prueba aquí es la decisión del
 * worker (cuándo arrancar, cuándo no hacer nada, qué pasar a `sendOutbound`), no el lanzamiento en
 * sí, que ya cubre `campaign.schedule.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../repositories/base.repository.js';
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

const { launchCampaign, prepararImagenCabecera, resolverPresupuesto } = vi.hoisted(() => ({
  launchCampaign: vi.fn(),
  prepararImagenCabecera: vi.fn(),
  resolverPresupuesto: vi.fn(),
}));
vi.mock('../features/campaign/campaign.service.js', async (original) => {
  const real = await original<typeof import('../features/campaign/campaign.service.js')>();
  return {
    ...real,
    launchCampaign: (...args: unknown[]) => launchCampaign(...args),
    prepararImagenCabecera: (...args: unknown[]) => prepararImagenCabecera(...args),
    resolverPresupuesto: () => resolverPresupuesto(),
  };
});

import {
  processCampaignJob,
  processCampaignSweep,
  processScheduledStart,
} from './campaign-broadcast.processor.js';
import type { LeanCampaign } from '../features/campaign/campaign.types.js';

const tenantId = new Types.ObjectId();

async function crearProgramada(programadaPara: Date): Promise<Types.ObjectId> {
  const campana = await createScoped(Campaign, tenantId, {
    nombre: 'Seguimiento',
    filtros: {},
    templateId: new Types.ObjectId(),
    parametros: ['hola'],
    estado: 'programada',
    programadaPara,
    creadaPor: new Types.ObjectId(),
  });
  return campana._id;
}

async function estadoDe(id: Types.ObjectId): Promise<LeanCampaign> {
  const c = await findByIdScoped(Campaign, tenantId, id.toString()).lean<LeanCampaign | null>();
  if (!c) throw new Error('sin campaña');
  return c;
}

/** Simula el lanzamiento real: la campaña pasa a `en_curso`. */
function lanzarDeVerdad(): void {
  launchCampaign.mockImplementation(async (_t: string, _a: string, id: string) => {
    await Campaign.updateOne({ _id: id }, { $set: { estado: 'en_curso', programadaPara: null } });
  });
}

describe('HU-MARK-03 — processScheduledStart', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
    ]);
  });

  it('a su hora, lanza la campaña con su tenant y su creador', async () => {
    lanzarDeVerdad();
    const hora = new Date(Date.now() - 100);
    const id = await crearProgramada(hora);

    await processScheduledStart({
      tenantId: tenantId.toString(),
      campaignId: id.toString(),
      programadaParaMs: hora.getTime(),
    });

    expect(launchCampaign).toHaveBeenCalledTimes(1);
    expect(launchCampaign.mock.calls[0]?.[0]).toBe(tenantId.toString());
    expect((await estadoDe(id)).estado).toBe('en_curso');
  });

  it('el job de una hora anterior a una reprogramación es un no-op', async () => {
    const nuevaHora = new Date(Date.now() + 3_600_000);
    const id = await crearProgramada(nuevaHora);

    await processScheduledStart({
      tenantId: tenantId.toString(),
      campaignId: id.toString(),
      programadaParaMs: nuevaHora.getTime() - 1_800_000,
    });

    expect(launchCampaign).not.toHaveBeenCalled();
    expect((await estadoDe(id)).estado).toBe('programada');
  });

  it('una campaña ya cancelada no arranca', async () => {
    const hora = new Date(Date.now() - 100);
    const id = await crearProgramada(hora);
    await Campaign.updateOne({ _id: id }, { $set: { estado: 'cancelada' } });

    await processScheduledStart({
      tenantId: tenantId.toString(),
      campaignId: id.toString(),
      programadaParaMs: hora.getTime(),
    });

    expect(launchCampaign).not.toHaveBeenCalled();
  });

  it('job exacto + barrido de respaldo → la campaña se lanza UNA sola vez', async () => {
    lanzarDeVerdad();
    const hora = new Date(Date.now() - 100);
    const id = await crearProgramada(hora);

    await processScheduledStart({
      tenantId: tenantId.toString(),
      campaignId: id.toString(),
      programadaParaMs: hora.getTime(),
    });
    await processCampaignSweep();

    expect(launchCampaign).toHaveBeenCalledTimes(1);
  });

  it('si el arranque falla (imagen rechazada por Meta), la campaña queda `fallida` con motivo', async () => {
    launchCampaign.mockRejectedValue(new Error('No se pudo subir la imagen de la campaña a WhatsApp.'));
    const hora = new Date(Date.now() - 100);
    const id = await crearProgramada(hora);

    await processScheduledStart({
      tenantId: tenantId.toString(),
      campaignId: id.toString(),
      programadaParaMs: hora.getTime(),
    });

    const campana = await estadoDe(id);
    expect(campana.estado).toBe('fallida');
    expect(campana.motivo).toContain('imagen');
  });

  it('con el tenantId de otra empresa no encuentra la campaña y no lanza nada', async () => {
    const hora = new Date(Date.now() - 100);
    const id = await crearProgramada(hora);

    await processScheduledStart({
      tenantId: new Types.ObjectId().toString(),
      campaignId: id.toString(),
      programadaParaMs: hora.getTime(),
    });

    expect(launchCampaign).not.toHaveBeenCalled();
    expect((await estadoDe(id)).estado).toBe('programada');
  });
});

describe('HU-MARK-03 — lote con imagen de cabecera', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
    ]);
    resolverPresupuesto.mockResolvedValue({
      tier: 'TIER_1K',
      calidad: 'GREEN',
      limiteDiario: 800,
      consumido24h: 0,
      disponible: 800,
      intervaloMs: 0,
      bloqueado: false,
      motivoBloqueo: null,
    });
    sendOutbound.mockResolvedValue({ metaMessageId: 'wamid.1' });
  });

  it('cada envío lleva la imagen de cabecera ya subida', async () => {
    prepararImagenCabecera.mockResolvedValue({ metaMediaId: 'meta-media-1' });
    const campana = await createScoped(Campaign, tenantId, {
      nombre: 'Seguimiento',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: ['hola'],
      estado: 'en_curso',
      creadaPor: new Types.ObjectId(),
      totales: { destinatarios: 1, enviados: 0, entregados: 0, fallidos: 0, omitidos: 0 },
    });
    const cliente = await createScoped(Cliente, tenantId, {
      metaUserId: 'meta-0',
      telefono: '573001110000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
    });
    await createScoped(CampaignRecipient, tenantId, {
      campaignId: campana._id,
      clienteId: cliente._id,
      telefono: cliente.telefono,
      estado: 'pendiente',
    });

    await processCampaignJob({ tenantId: tenantId.toString(), campaignId: campana._id.toString(), lote: 0 });

    expect(sendOutbound).toHaveBeenCalledWith(tenantId.toString(), cliente._id.toString(), {
      modo: 'plantilla',
      templateId: campana.templateId.toString(),
      parametros: ['hola'],
      imagenCabecera: { metaMediaId: 'meta-media-1' },
    });
  });

  it('una campaña de solo texto no manda `imagenCabecera`', async () => {
    prepararImagenCabecera.mockResolvedValue(undefined);
    const campana = await createScoped(Campaign, tenantId, {
      nombre: 'Texto',
      filtros: {},
      templateId: new Types.ObjectId(),
      parametros: [],
      estado: 'en_curso',
      creadaPor: new Types.ObjectId(),
      totales: { destinatarios: 1, enviados: 0, entregados: 0, fallidos: 0, omitidos: 0 },
    });
    const cliente = await createScoped(Cliente, tenantId, {
      metaUserId: 'meta-1',
      telefono: '573001110001',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
    });
    await createScoped(CampaignRecipient, tenantId, {
      campaignId: campana._id,
      clienteId: cliente._id,
      telefono: cliente.telefono,
      estado: 'pendiente',
    });

    await processCampaignJob({ tenantId: tenantId.toString(), campaignId: campana._id.toString(), lote: 0 });

    expect(sendOutbound.mock.calls[0]?.[2]).not.toHaveProperty('imagenCabecera');
  });
});

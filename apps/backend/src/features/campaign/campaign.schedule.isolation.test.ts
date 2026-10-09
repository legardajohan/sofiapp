/**
 * HU-MARK-03 — aislamiento multi-tenant del programador de campañas (criterio 10).
 *
 * Una campaña programada del tenant A no es legible, reprogramable ni cancelable desde B; su imagen
 * vive bajo el prefijo de A y no se resuelve desde B; y ninguna de esas operaciones escribe nada.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../../integrations/storage/index.js';
import { Campaign } from './campaign.model.js';

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

import { campaignQueue } from '../../config/queues.js';
import {
  cancelCampaign,
  getCampaign,
  rescheduleCampaign,
  resolverImagenCampana,
  scheduleCampaign,
} from './campaign.service.js';
import type { LeanCampaign } from './campaign.types.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const actorB = new Types.ObjectId().toString();

const storage = {
  driver: 'local' as const,
  guardar: vi.fn(async ({ key, contenido, mimeType }: { key: string; contenido: Buffer; mimeType: string }) => ({
    key,
    mimeType,
    tamanoBytes: contenido.byteLength,
  })),
  leer: vi.fn(),
  urlFirmada: vi.fn(async () => null),
  eliminar: vi.fn(async () => undefined),
};

async function plantillaImagen(tenantId: Types.ObjectId): Promise<string> {
  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: `meta-${tenantId.toString()}`,
    name: 'seguimiento_img',
    language: 'es',
    category: 'MARKETING',
    status: 'APPROVED',
    components: [
      { type: 'HEADER', format: 'IMAGE' },
      { type: 'BODY', text: 'Hola' },
    ],
    parametrosBody: 0,
  });
  return doc._id.toString();
}

async function snapshot(id: string): Promise<LeanCampaign> {
  const c = await findByIdScoped(Campaign, tenantA, id).lean<LeanCampaign | null>();
  if (!c) throw new Error('sin campaña');
  return c;
}

describe('HU-MARK-03 — aislamiento del programador de campañas', () => {
  let campaignIdA: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    setMediaStorageForTests(storage as unknown as IMediaStorage);
    await Promise.all([Campaign.deleteMany({}), WhatsAppTemplate.deleteMany({})]);

    const templateA = await plantillaImagen(tenantA);
    await plantillaImagen(tenantB);

    const campana = await scheduleCampaign(
      tenantA,
      new Types.ObjectId().toString(),
      {
        nombre: 'Campaña de A',
        filtros: {},
        templateId: templateA,
        parametros: [],
        programadaPara: new Date(Date.now() + 3_600_000).toISOString(),
      },
      { buffer: Buffer.from('a'), mimeType: 'image/png', nombreArchivo: 'a.png' },
    );
    campaignIdA = campana.id;
    vi.clearAllMocks();
  });

  it('la imagen de A se guarda bajo el prefijo de A', async () => {
    const campana = await snapshot(campaignIdA);
    expect(campana.contenido.imagen?.mediaKey.startsWith(`${tenantA.toString()}/campaigns/`)).toBe(
      true,
    );
  });

  it('B no puede leer la campaña de A → 404', async () => {
    await expect(getCampaign(tenantB, campaignIdA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('B no puede reprogramar la campaña de A → 404, sin escribir, sin encolar ni guardar imagen', async () => {
    const antes = await snapshot(campaignIdA);

    await expect(
      rescheduleCampaign(
        tenantB,
        actorB,
        campaignIdA,
        { programadaPara: new Date(Date.now() + 7_200_000).toISOString(), nombre: 'Robada' },
        { buffer: Buffer.from('b'), mimeType: 'image/png', nombreArchivo: 'b.png' },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    const despues = await snapshot(campaignIdA);
    expect(despues.nombre).toBe(antes.nombre);
    expect(despues.programadaPara?.getTime()).toBe(antes.programadaPara?.getTime());
    expect(despues.contenido.imagen?.mediaKey).toBe(antes.contenido.imagen?.mediaKey);
    expect(campaignQueue.add).not.toHaveBeenCalled();
    expect(storage.guardar).not.toHaveBeenCalled();
  });

  it('B no puede cancelar la campaña programada de A → 404 y sigue `programada`', async () => {
    await expect(cancelCampaign(tenantB, actorB, campaignIdA)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await snapshot(campaignIdA)).estado).toBe('programada');
  });

  it('la imagen de A no se resuelve desde B (404, el mismo que "no existe")', async () => {
    await expect(resolverImagenCampana(tenantB, campaignIdA)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(resolverImagenCampana(tenantA, campaignIdA)).resolves.toMatchObject({
      mimeType: 'image/png',
    });
  });

  it('B no puede programar con la plantilla de A → 404 sin crear nada', async () => {
    const templateA = (await snapshot(campaignIdA)).templateId.toString();

    await expect(
      scheduleCampaign(
        tenantB,
        actorB,
        {
          nombre: 'Intento',
          filtros: {},
          templateId: templateA,
          parametros: [],
          programadaPara: new Date(Date.now() + 3_600_000).toISOString(),
        },
        { buffer: Buffer.from('b'), mimeType: 'image/png', nombreArchivo: 'b.png' },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await Campaign.countDocuments({ tenantId: tenantB })).toBe(0);
    expect(storage.guardar).not.toHaveBeenCalled();
  });
});

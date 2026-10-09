/**
 * HU-MARK-03 — programar campañas con fecha/hora, texto e imagen.
 *
 * Nivel de servicio: persistencia de la programación, job de arranque exacto, reprogramar,
 * cancelar y la subida única de la imagen a Meta al arrancar. El multipart se prueba aparte en
 * `campaign.schedule.routes.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { TenantUsage } from '../usage/usage.model.js';
import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../../integrations/storage/index.js';

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

const { mockSubir } = vi.hoisted(() => ({ mockSubir: vi.fn() }));
vi.mock('../../integrations/meta/meta-media.client.js', async () => {
  const real = await vi.importActual<typeof import('../../integrations/meta/meta-media.client.js')>(
    '../../integrations/meta/meta-media.client.js',
  );
  return { ...real, metaMediaClient: { ...real.metaMediaClient, subir: mockSubir } };
});

import { CAMPAIGN_SCHEDULED_START_JOB, campaignQueue } from '../../config/queues.js';
import {
  campaignStartJobId,
  cancelCampaign,
  getCampaign,
  launchCampaign,
  prepararImagenCabecera,
  rescheduleCampaign,
  scheduleCampaign,
} from './campaign.service.js';
import type { IImagenSubida, LeanCampaign, ScheduleCampaignDTO } from './campaign.types.js';

const tenantId = new Types.ObjectId();
const actorId = new Types.ObjectId().toString();
const MS_DIA = 86_400_000;

/** Almacenamiento en memoria: deja ver qué claves se escriben y se borran. */
const objetos = new Map<string, Buffer>();
const storage = {
  driver: 'local' as const,
  guardar: vi.fn(async ({ key, contenido, mimeType }: { key: string; contenido: Buffer; mimeType: string }) => {
    objetos.set(key, contenido);
    return { key, mimeType, tamanoBytes: contenido.byteLength };
  }),
  leer: vi.fn(async (key: string) => {
    const contenido = objetos.get(key);
    if (!contenido) throw new Error('no existe');
    return { stream: Readable.from(contenido), mimeType: 'image/png', tamanoBytes: contenido.byteLength };
  }),
  urlFirmada: vi.fn(async () => null),
  eliminar: vi.fn(async (key: string) => {
    objetos.delete(key);
  }),
};

const PNG: IImagenSubida = {
  buffer: Buffer.from('png-falso'),
  mimeType: 'image/png',
  nombreArchivo: 'promo.png',
};

let plantillaImagen: string;
let plantillaTexto: string;

async function crearPlantilla(nombre: string, conImagen: boolean): Promise<string> {
  const doc = await createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: `meta-${nombre}`,
    name: nombre,
    language: 'es',
    category: 'MARKETING',
    status: 'APPROVED',
    components: [
      ...(conImagen ? [{ type: 'HEADER', format: 'IMAGE' }] : []),
      { type: 'BODY', text: 'Hola, {{1}}' },
    ],
    parametrosBody: 1,
  });
  return doc._id.toString();
}

function enUnaHora(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

function dto(extra: Partial<ScheduleCampaignDTO> = {}): ScheduleCampaignDTO {
  return {
    nombre: 'Seguimiento de noviembre',
    filtros: { rolContacto: ['estudiante'] },
    templateId: plantillaImagen,
    parametros: ['te esperamos'],
    programadaPara: enUnaHora(),
    ...extra,
  };
}

async function leerCampana(id: string): Promise<LeanCampaign> {
  const c = await findByIdScoped(Campaign, tenantId, id).lean<LeanCampaign | null>();
  if (!c) throw new Error('campaña no encontrada');
  return c;
}

describe('HU-MARK-03 — programar campañas con imagen', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    objetos.clear();
    setMediaStorageForTests(storage as unknown as IMediaStorage);
    mockSubir.mockResolvedValue({ mediaId: 'meta-media-1' });

    await Promise.all([
      Campaign.deleteMany({}),
      CampaignRecipient.deleteMany({}),
      Cliente.deleteMany({}),
      MetaIntegration.deleteMany({}),
      WhatsAppTemplate.deleteMany({}),
      TenantUsage.deleteMany({}),
    ]);

    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
    plantillaImagen = await crearPlantilla('seguimiento_con_imagen', true);
    plantillaTexto = await crearPlantilla('seguimiento_texto', false);

    for (let i = 0; i < 2; i += 1) {
      await createScoped(Cliente, tenantId, {
        metaUserId: `meta-${i}`,
        telefono: `57300111000${i}`,
        canalOrigen: 'whatsapp',
        estadoComercial: 'nuevo',
        rolContacto: 'estudiante',
        marketingOptOut: false,
      });
    }
  });

  describe('scheduleCampaign', () => {
    it('persiste la campaña `programada` con su imagen bajo el prefijo del tenant', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);

      expect(campana.estado).toBe('programada');
      expect(campana.imagen).toMatchObject({ mimeType: 'image/png', tamanoBytes: PNG.buffer.byteLength });
      expect(campana.imagen?.url).toMatch(
        new RegExp(`^/media/campaigns/${campana.id}/imagen\\?t=${tenantId.toString()}\\.`),
      );

      const guardada = await leerCampana(campana.id);
      expect(guardada.contenido.imagen?.mediaKey).toMatch(
        new RegExp(`^${tenantId.toString()}/campaigns/${campana.id}/.+\\.png$`),
      );
      // La imagen NO se sube a Meta al programar: el id caducaría antes de usarse.
      expect(guardada.contenido.imagen?.metaMediaId).toBeNull();
      expect(mockSubir).not.toHaveBeenCalled();
    });

    it('encola el arranque exacto con `delay` hasta la hora y un jobId que incluye la hora', async () => {
      const programadaPara = enUnaHora();
      const campana = await scheduleCampaign(tenantId, actorId, dto({ programadaPara }), PNG);
      const ms = new Date(programadaPara).getTime();

      expect(campaignQueue.add).toHaveBeenCalledTimes(1);
      const [nombre, data, opts] = vi.mocked(campaignQueue.add).mock.calls[0]!;
      expect(nombre).toBe(CAMPAIGN_SCHEDULED_START_JOB);
      expect(data).toEqual({ tenantId: tenantId.toString(), campaignId: campana.id, programadaParaMs: ms });
      expect(opts?.jobId).toBe(campaignStartJobId(campana.id, ms));
      expect(opts?.jobId).not.toContain(':');
      expect(opts?.delay).toBeGreaterThan(3_500_000);
      expect(opts?.delay).toBeLessThanOrEqual(3_600_000);
    });

    it('no consume la cuota `campanasMes` al programar', async () => {
      await scheduleCampaign(tenantId, actorId, dto(), PNG);
      expect(await TenantUsage.countDocuments({ tenantId })).toBe(0);
    });

    it('una campaña de solo texto se programa sin imagen', async () => {
      const campana = await scheduleCampaign(
        tenantId,
        actorId,
        dto({ templateId: plantillaTexto }),
        undefined,
      );
      expect(campana.imagen).toBeNull();
      expect(storage.guardar).not.toHaveBeenCalled();
    });

    it('mime distinto de jpeg/png → 400 sin guardar nada', async () => {
      await expect(
        scheduleCampaign(tenantId, actorId, dto(), { ...PNG, mimeType: 'image/gif' }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(storage.guardar).not.toHaveBeenCalled();
      expect(await Campaign.countDocuments({ tenantId })).toBe(0);
    });

    it('plantilla con cabecera IMAGE sin imagen → 422 sin crear la campaña', async () => {
      await expect(scheduleCampaign(tenantId, actorId, dto(), undefined)).rejects.toMatchObject({
        statusCode: 422,
      });
      expect(await Campaign.countDocuments({ tenantId })).toBe(0);
    });

    it('imagen con una plantilla sin cabecera de media → 400 sin guardar la imagen', async () => {
      await expect(
        scheduleCampaign(tenantId, actorId, dto({ templateId: plantillaTexto }), PNG),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(storage.guardar).not.toHaveBeenCalled();
    });

    it('número de parámetros distinto → 400 con `{ esperados, recibidos }`', async () => {
      await expect(
        scheduleCampaign(tenantId, actorId, dto({ parametros: [] }), PNG),
      ).rejects.toMatchObject({ statusCode: 400, details: { esperados: 1, recibidos: 0 } });
    });
  });

  describe('rescheduleCampaign', () => {
    it('cambiar la hora encola un job nuevo con otro jobId', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);
      const nuevaHora = new Date(Date.now() + 2 * 3_600_000).toISOString();

      const actualizada = await rescheduleCampaign(
        tenantId,
        actorId,
        campana.id,
        { programadaPara: nuevaHora },
        undefined,
      );

      expect(actualizada.programadaPara).toBe(nuevaHora);
      const jobIds = vi.mocked(campaignQueue.add).mock.calls.map((c) => c[2]?.jobId);
      expect(jobIds).toEqual([
        campaignStartJobId(campana.id, new Date(campana.programadaPara!).getTime()),
        campaignStartJobId(campana.id, new Date(nuevaHora).getTime()),
      ]);
    });

    it('cambiar la imagen guarda la nueva y borra la anterior', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);
      const anterior = (await leerCampana(campana.id)).contenido.imagen!.mediaKey;

      await rescheduleCampaign(
        tenantId,
        actorId,
        campana.id,
        {},
        { buffer: Buffer.from('jpg'), mimeType: 'image/jpeg', nombreArchivo: 'b.jpg' },
      );

      const nueva = (await leerCampana(campana.id)).contenido.imagen!;
      expect(nueva.mediaKey).not.toBe(anterior);
      expect(nueva.mimeType).toBe('image/jpeg');
      await vi.waitFor(() => expect(storage.eliminar).toHaveBeenCalledWith(anterior));
    });

    it('quitar la imagen de una plantilla IMAGE → 422 (la plantilla la exige)', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);
      await expect(
        rescheduleCampaign(tenantId, actorId, campana.id, { quitarImagen: true }, undefined),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('fuera de `programada` → 409', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);
      await Campaign.updateOne({ _id: campana.id }, { $set: { estado: 'en_curso' } });

      await expect(
        rescheduleCampaign(tenantId, actorId, campana.id, { programadaPara: enUnaHora() }, undefined),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  it('cancelar una `programada` la deja cancelada sin destinatarios ni cuota', async () => {
    const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);

    const cancelada = await cancelCampaign(tenantId, actorId, campana.id);

    expect(cancelada.estado).toBe('cancelada');
    expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(0);
    expect(await TenantUsage.countDocuments({ tenantId })).toBe(0);
  });

  describe('arranque con imagen', () => {
    it('sube la imagen a Meta UNA vez, cachea el id y materializa el segmento', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);

      const lanzada = await launchCampaign(tenantId, actorId, campana.id);

      expect(lanzada.estado).toBe('en_curso');
      expect(lanzada.totales.destinatarios).toBe(2);
      expect(mockSubir).toHaveBeenCalledTimes(1);
      expect(mockSubir).toHaveBeenCalledWith('phone-1', 'token', {
        buffer: PNG.buffer,
        mimeType: 'image/png',
        nombreArchivo: `campana-${campana.id}.png`,
      });

      // Los lotes reutilizan el id cacheado: no vuelven a subir.
      const releida = await leerCampana(campana.id);
      expect(releida.contenido.imagen?.metaMediaId).toBe('meta-media-1');
      await expect(prepararImagenCabecera(tenantId, releida)).resolves.toEqual({
        metaMediaId: 'meta-media-1',
      });
      expect(mockSubir).toHaveBeenCalledTimes(1);
    });

    it('un id de Meta de más de 25 días se vuelve a subir', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);
      await Campaign.updateOne(
        { _id: campana.id },
        {
          $set: {
            'contenido.imagen.metaMediaId': 'viejo',
            'contenido.imagen.subidaMetaAt': new Date(Date.now() - 26 * MS_DIA),
          },
        },
      );
      mockSubir.mockResolvedValueOnce({ mediaId: 'renovado' });

      const resultado = await prepararImagenCabecera(tenantId, await leerCampana(campana.id));

      expect(resultado).toEqual({ metaMediaId: 'renovado' });
      expect((await leerCampana(campana.id)).contenido.imagen?.metaMediaId).toBe('renovado');
    });

    it('si Meta rechaza la imagen → 502 y no se materializa a nadie', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);
      mockSubir.mockRejectedValueOnce(new Error('Meta caído'));

      await expect(launchCampaign(tenantId, actorId, campana.id)).rejects.toMatchObject({
        statusCode: 502,
      });
      expect(await CampaignRecipient.countDocuments({ tenantId })).toBe(0);
    });

    it('el detalle expone la imagen con URL firmada', async () => {
      const campana = await scheduleCampaign(tenantId, actorId, dto(), PNG);
      const detalle = await getCampaign(tenantId, campana.id);
      expect(detalle.imagen?.url).toContain(`/media/campaigns/${campana.id}/imagen?t=`);
    });
  });
});

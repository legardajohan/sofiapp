/**
 * HU-MARK-05 — variables de contacto en una campaña: forma (Zod), coherencia (service) y que el
 * detalle las devuelva para que el wizard pueda reabrirlas.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { Campaign } from './campaign.model.js';

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

import { createCampaign, getCampaign } from './campaign.service.js';
import {
  createCampaignSchema,
  rescheduleCampaignSchema,
  scheduleCampaignSchema,
} from './campaign.validation.js';

const tenantId = new Types.ObjectId();
const actorId = new Types.ObjectId().toString();
let templateId: string;

const base = (): { nombre: string; filtros: object; templateId: string; parametros: string[] } => ({
  nombre: 'Promo',
  filtros: {},
  templateId,
  parametros: ['estudiante', 'sábado'],
});

describe('Zod — forma de parametrosDinamicos', () => {
  beforeEach(() => {
    templateId = new Types.ObjectId().toString();
  });

  it('create acepta variables válidas', () => {
    const r = createCampaignSchema.safeParse({
      body: { ...base(), parametrosDinamicos: [{ indice: 0, campo: 'nombre' }] },
      params: {},
      query: {},
    });
    expect(r.success).toBe(true);
  });

  it('create rechaza un campo que no es de contacto', () => {
    const r = createCampaignSchema.safeParse({
      body: { ...base(), parametrosDinamicos: [{ indice: 0, campo: 'correo' }] },
      params: {},
      query: {},
    });
    expect(r.success).toBe(false);
  });

  it('schedule y reschedule las aceptan serializadas como JSON (multipart)', () => {
    const json = JSON.stringify([{ indice: 1, campo: 'telefono' }]);
    const programada = scheduleCampaignSchema.safeParse({
      body: {
        ...base(),
        filtros: '{}',
        parametros: JSON.stringify(base().parametros),
        parametrosDinamicos: json,
        programadaPara: new Date(Date.now() + 3_600_000).toISOString(),
      },
      params: {},
      query: {},
    });
    const reprogramada = rescheduleCampaignSchema.safeParse({
      body: { parametrosDinamicos: json },
      params: { id: new Types.ObjectId().toString() },
      query: {},
    });

    expect(programada.success).toBe(true);
    expect(reprogramada.success).toBe(true);
    if (reprogramada.success) {
      expect(reprogramada.data.body.parametrosDinamicos).toEqual([{ indice: 1, campo: 'telefono' }]);
    }
  });
});

describe('createCampaign — variables de contacto', () => {
  beforeEach(async () => {
    await Promise.all([Campaign.deleteMany({}), WhatsAppTemplate.deleteMany({})]);
    const tpl = await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-vars',
      name: 'promo_vars',
      language: 'es',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola {{1}}, el {{2}}' }],
      parametrosBody: 2,
    });
    templateId = tpl._id.toString();
  });

  it('las guarda y el detalle las devuelve', async () => {
    const creada = await createCampaign(tenantId, actorId, {
      ...base(),
      parametrosDinamicos: [{ indice: 0, campo: 'nombre' }],
    });

    expect(creada.parametrosDinamicos).toEqual([{ indice: 0, campo: 'nombre' }]);
    const detalle = await getCampaign(tenantId, creada.id);
    expect(detalle.parametrosDinamicos).toEqual([{ indice: 0, campo: 'nombre' }]);
  });

  it('sin variables, la campaña queda con todos los parámetros fijos', async () => {
    const creada = await createCampaign(tenantId, actorId, base());
    expect(creada.parametrosDinamicos).toEqual([]);
  });

  it('rechaza con 400 una variable sobre un parámetro inexistente, sin crear nada', async () => {
    await expect(
      createCampaign(tenantId, actorId, {
        ...base(),
        parametrosDinamicos: [{ indice: 5, campo: 'nombre' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await Campaign.countDocuments({ tenantId })).toBe(0);
  });
});

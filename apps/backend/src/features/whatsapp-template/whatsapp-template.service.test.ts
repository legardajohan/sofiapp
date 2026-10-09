import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from './whatsapp-template.model.js';
import type { IPlantillaComponente } from './whatsapp-template.types.js';

vi.mock('../../integrations/meta/meta-template.client.js', () => ({
  metaTemplateClient: { list: vi.fn(), create: vi.fn() },
}));

import { metaTemplateClient } from '../../integrations/meta/meta-template.client.js';
import {
  assertContenidoCompatible,
  buildTemplatePayload,
  createTemplate,
  formatoCabecera,
  syncTemplates,
} from './whatsapp-template.service.js';

function bodyComponent(cuerpo: string): IPlantillaComponente[] {
  return [{ type: 'BODY', text: cuerpo }];
}

async function crearIntegracion(tenantId: Types.ObjectId): Promise<void> {
  await createScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
    wabaId: 'waba-1',
    phoneNumberId: 'phone-1',
    accessTokenEnc: encrypt('token'),
    activo: true,
  });
}

describe('syncTemplates', () => {
  it('crea las nuevas, actualiza el status de las existentes y marca obsoleta:true las que Meta ya no devuelve, sin borrarlas', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);

    await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-existente',
      name: 'existente',
      language: 'es',
      category: 'UTILITY',
      status: 'PENDING',
      components: bodyComponent('Hola'),
      parametrosBody: 0,
      syncedAt: new Date(0),
      obsoleta: false,
    });
    await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-desaparecida',
      name: 'desaparecida',
      language: 'es',
      category: 'UTILITY',
      status: 'APPROVED',
      components: bodyComponent('Hola'),
      parametrosBody: 0,
      syncedAt: new Date(0),
      obsoleta: false,
    });

    vi.mocked(metaTemplateClient.list).mockResolvedValueOnce([
      {
        id: 'meta-existente',
        name: 'existente',
        language: 'es',
        category: 'UTILITY',
        status: 'APPROVED', // Meta la aprobó desde el último sync
        components: bodyComponent('Hola'),
      },
      {
        id: 'meta-nueva',
        name: 'nueva',
        language: 'es',
        category: 'MARKETING',
        status: 'PENDING',
        components: bodyComponent('Oferta {{1}}'),
      },
      // 'desaparecida' ya no viene en la respuesta de Meta.
    ]);

    const resultado = await syncTemplates(tenantId);
    expect(resultado).toEqual({ creadas: 1, actualizadas: 1, obsoletas: 1 });

    const existente = await WhatsAppTemplate.findOne({ tenantId, name: 'existente' }).lean();
    expect(existente?.status).toBe('APPROVED');
    expect(existente?.obsoleta).toBe(false);

    const nueva = await WhatsAppTemplate.findOne({ tenantId, name: 'nueva' }).lean();
    expect(nueva).not.toBeNull();
    expect(nueva?.parametrosBody).toBe(1);

    const desaparecida = await WhatsAppTemplate.findOne({ tenantId, name: 'desaparecida' }).lean();
    expect(desaparecida).not.toBeNull(); // no se borra
    expect(desaparecida?.obsoleta).toBe(true);
  });
});

describe('buildTemplatePayload', () => {
  it('con status distinto de APPROVED → AppError 422 y el cliente de Meta no se llama', async () => {
    const tenantId = new Types.ObjectId();
    const creada = await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-pending',
      name: 'pendiente',
      language: 'es',
      category: 'UTILITY',
      status: 'PENDING',
      components: bodyComponent('Hola {{1}}'),
      parametrosBody: 1,
      syncedAt: new Date(),
      obsoleta: false,
    });

    await expect(buildTemplatePayload(tenantId, String(creada._id), ['x'])).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(metaTemplateClient.create).not.toHaveBeenCalled();
  });

  it('con un número de parámetros distinto al esperado → AppError 400 con el detalle', async () => {
    const tenantId = new Types.ObjectId();
    const creada = await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-2params',
      name: 'con_dos_parametros',
      language: 'es',
      category: 'UTILITY',
      status: 'APPROVED',
      components: bodyComponent('Hola {{1}}, tu cita es el {{2}}'),
      parametrosBody: 2,
      syncedAt: new Date(),
      obsoleta: false,
    });

    await expect(buildTemplatePayload(tenantId, String(creada._id), ['solo-uno'])).rejects.toMatchObject(
      { statusCode: 400, details: { esperados: 2, recibidos: 1 } },
    );
  });
});

describe('createTemplate', () => {
  it('deriva parametrosBody de "Hola {{1}}, tu cita es el {{2}}" → 2', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({
      id: 'meta-creada',
      status: 'PENDING',
    });

    const result = await createTemplate(tenantId, {
      name: 'cita_recordatorio',
      language: 'es',
      category: 'UTILITY',
      cuerpo: 'Hola {{1}}, tu cita es el {{2}}',
      ejemplos: ['Ana', '20 de agosto'],
    });

    expect(result.parametrosBody).toBe(2);
    expect(result.status).toBe('PENDING');
  });

  it('que falla en Meta no deja documento local huérfano', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    vi.mocked(metaTemplateClient.create).mockRejectedValueOnce(new Error('Meta rechazó la plantilla'));

    await expect(
      createTemplate(tenantId, {
        name: 'rechazada',
        language: 'es',
        category: 'UTILITY',
        cuerpo: 'Hola {{1}}',
        ejemplos: [],
      }),
    ).rejects.toThrow();

    const doc = await WhatsAppTemplate.findOne({ tenantId, name: 'rechazada' }).lean();
    expect(doc).toBeNull();
  });
});

describe('HU-MARK-03 — cabecera IMAGE en buildTemplatePayload', () => {
  async function crearConCabecera(
    tenantId: Types.ObjectId,
    format: 'IMAGE' | 'DOCUMENT' | 'TEXT' | null,
    parametrosBody = 1,
  ): Promise<string> {
    const components: IPlantillaComponente[] = [
      ...(format ? [{ type: 'HEADER' as const, format }] : []),
      { type: 'BODY', text: parametrosBody > 0 ? 'Hola {{1}}' : 'Hola' },
    ];
    const creada = await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: `meta-${format ?? 'sin'}-${parametrosBody}`,
      name: `cabecera_${(format ?? 'sin').toLowerCase()}`,
      language: 'es',
      category: 'MARKETING',
      status: 'APPROVED',
      components,
      parametrosBody,
      syncedAt: new Date(),
      obsoleta: false,
    });
    return String(creada._id);
  }

  it('sin cabecera de media y sin imagen → payload idéntico al de siempre (retrocompatible)', async () => {
    const tenantId = new Types.ObjectId();
    const id = await crearConCabecera(tenantId, null);

    const payload = await buildTemplatePayload(tenantId, id, ['Ana']);

    expect(payload.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }] },
    ]);
  });

  it('IMAGE con metaMediaId → componente header con image.id antes del body', async () => {
    const tenantId = new Types.ObjectId();
    const id = await crearConCabecera(tenantId, 'IMAGE');

    const payload = await buildTemplatePayload(tenantId, id, ['Ana'], {
      tipo: 'image',
      metaMediaId: 'media-123',
    });

    expect(payload.components).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { id: 'media-123' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }] },
    ]);
  });

  it('IMAGE sin imagen → 422', async () => {
    const tenantId = new Types.ObjectId();
    const id = await crearConCabecera(tenantId, 'IMAGE');
    await expect(buildTemplatePayload(tenantId, id, ['Ana'])).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('imagen con una plantilla sin cabecera de media → 400', async () => {
    const tenantId = new Types.ObjectId();
    const id = await crearConCabecera(tenantId, 'TEXT');
    await expect(
      buildTemplatePayload(tenantId, id, ['Ana'], { tipo: 'image', metaMediaId: 'm' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cabecera DOCUMENT → 422 (fuera de alcance), también al validar sin payload', async () => {
    const tenantId = new Types.ObjectId();
    const id = await crearConCabecera(tenantId, 'DOCUMENT');
    await expect(assertContenidoCompatible(tenantId, id, ['Ana'], false)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('el conteo de parámetros se valida antes que la cabecera (400 con el detalle)', async () => {
    const tenantId = new Types.ObjectId();
    const id = await crearConCabecera(tenantId, 'IMAGE');
    await expect(assertContenidoCompatible(tenantId, id, [], true)).rejects.toMatchObject({
      statusCode: 400,
      details: { esperados: 1, recibidos: 0 },
    });
  });

  it('formatoCabecera: sin HEADER → NINGUNA; HEADER sin format → TEXT', () => {
    expect(formatoCabecera({ components: [{ type: 'BODY', text: 'x' }] })).toBe('NINGUNA');
    expect(formatoCabecera({ components: [{ type: 'HEADER', text: 'Hola' }] })).toBe('TEXT');
    expect(formatoCabecera({ components: [{ type: 'HEADER', format: 'IMAGE' }] })).toBe('IMAGE');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { WhatsAppTemplate } from './whatsapp-template.model.js';
import type { IPlantillaComponente, LeanWhatsAppTemplate } from './whatsapp-template.types.js';

vi.mock('../../integrations/meta/meta-template.client.js', () => ({
  metaTemplateClient: { list: vi.fn(), create: vi.fn() },
}));

import { metaTemplateClient } from '../../integrations/meta/meta-template.client.js';
import { buildTemplatePayload, listTemplates, syncTemplates } from './whatsapp-template.service.js';

function bodyComponent(cuerpo: string): IPlantillaComponente[] {
  return [{ type: 'BODY', text: cuerpo }];
}

async function crearPlantilla(
  tenantId: Types.ObjectId,
  overrides: Partial<{ name: string; metaTemplateId: string }> = {},
) {
  return createScoped(WhatsAppTemplate, tenantId, {
    metaTemplateId: overrides.metaTemplateId ?? 'meta-template-1',
    name: overrides.name ?? 'bienvenida',
    language: 'es',
    category: 'UTILITY',
    status: 'APPROVED',
    components: bodyComponent('Hola {{1}}'),
    parametrosBody: 1,
    syncedAt: new Date(),
    obsoleta: false,
  });
}

describe('whatsapp-template — aislamiento multi-tenant', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  it('plantilla creada bajo tenantA no aparece en listTemplates(tenantB)', async () => {
    await crearPlantilla(tenantA);

    const result = await listTemplates(tenantB, { page: 1, limit: 20 });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('buildTemplatePayload(tenantB, idDeA, [...]) → 404, indistinguible de "no existe"', async () => {
    const creada = await crearPlantilla(tenantA);

    await expect(buildTemplatePayload(tenantB, String(creada._id), ['x'])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('dos tenants con el mismo name + language coexisten sin violar el índice único', async () => {
    await WhatsAppTemplate.syncIndexes();

    await crearPlantilla(tenantA, { name: 'recordatorio', metaTemplateId: 'meta-a' });

    await expect(
      crearPlantilla(tenantB, { name: 'recordatorio', metaTemplateId: 'meta-b' }),
    ).resolves.toBeTruthy();
  });

  it('syncTemplates(tenantA) no marca como obsoletas las plantillas de tenantB', async () => {
    await createScoped(MetaIntegration, tenantA, {
      canal: 'whatsapp',
      wabaId: 'waba-a',
      phoneNumberId: 'phone-a',
      accessTokenEnc: encrypt('token-a'),
      activo: true,
    });

    const deB = await crearPlantilla(tenantB, { name: 'solo_de_b', metaTemplateId: 'meta-b-solo' });

    // Meta no devuelve nada para tenantA: si el sync no estuviera scoped, esto marcaría TODO
    // como obsoleto, incluida la plantilla de tenantB.
    vi.mocked(metaTemplateClient.list).mockResolvedValueOnce([]);

    await syncTemplates(tenantA);

    const recargada = await findByIdScoped(WhatsAppTemplate, tenantB, deB._id)
      .lean<LeanWhatsAppTemplate | null>()
      .exec();
    expect(recargada?.obsoleta).toBe(false);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

// El servicio importa el singleton de AIService (para `answerQuestion`), que abre Redis al
// instanciarse. Aquí solo se prueban `get/updateAssistantConfig`, así que se corta esa raíz.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn() }),
}));

import { getAssistantConfig, updateAssistantConfig } from './ai-assistant.service.js';
import { PromptTemplateModel } from '../../services/ai/prompt-template.model.js';
import type { IPromptTemplate } from '../../services/ai/prompt-template.model.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

const GLOBAL_PROMPT = 'Prompt global de fábrica';

async function seedGlobal(): Promise<void> {
  await PromptTemplateModel.create({
    tenantId: null,
    method: 'chat',
    version: '1.0.0',
    isActive: true,
    systemPrompt: GLOBAL_PROMPT,
    tono: 'profesional, claro y cercano',
  });
}

describe('HU-IA-01 — configuración del asistente por empresa', () => {
  beforeEach(async () => {
    await PromptTemplateModel.deleteMany({});
    await seedGlobal();
  });

  it('un tenant sin plantilla propia hereda la global', async () => {
    const config = await getAssistantConfig(tenantA.toString());

    expect(config.heredado).toBe(true);
    expect(config.systemPrompt).toBe(GLOBAL_PROMPT);
    expect(config.tono).toBe('profesional, claro y cercano');
  });

  it('al guardar deja de heredar y devuelve lo suyo', async () => {
    const guardada = await updateAssistantConfig(tenantA.toString(), {
      tono: 'cercano y directo',
      systemPrompt: 'Instrucciones propias de la empresa A',
    });
    expect(guardada.heredado).toBe(false);

    const releida = await getAssistantConfig(tenantA.toString());
    expect(releida.heredado).toBe(false);
    expect(releida.tono).toBe('cercano y directo');
    expect(releida.systemPrompt).toBe('Instrucciones propias de la empresa A');
  });

  it('guardar NO modifica la plantilla global: los demás tenants la siguen heredando', async () => {
    await updateAssistantConfig(tenantA.toString(), {
      tono: 'cercano y directo',
      systemPrompt: 'Instrucciones propias de la empresa A',
    });

    const global = await PromptTemplateModel.findOne({ tenantId: null, method: 'chat' })
      .lean<IPromptTemplate>()
      .exec();
    expect(global?.systemPrompt).toBe(GLOBAL_PROMPT);

    const configB = await getAssistantConfig(tenantB.toString());
    expect(configB.heredado).toBe(true);
    expect(configB.systemPrompt).toBe(GLOBAL_PROMPT);
  });

  it('aislamiento: lo que guarda el tenantA no alcanza al tenantB', async () => {
    await updateAssistantConfig(tenantA.toString(), {
      tono: 'tono de A',
      systemPrompt: 'Prompt de A',
    });
    await updateAssistantConfig(tenantB.toString(), {
      tono: 'tono de B',
      systemPrompt: 'Prompt de B',
    });

    const a = await getAssistantConfig(tenantA.toString());
    const b = await getAssistantConfig(tenantB.toString());

    expect(a.systemPrompt).toBe('Prompt de A');
    expect(b.systemPrompt).toBe('Prompt de B');

    const plantillasDeA = await PromptTemplateModel.countDocuments({ tenantId: tenantA });
    expect(plantillasDeA).toBe(1);
  });

  it('la primera plantilla propia no reutiliza la versión de la global (invalida su caché)', async () => {
    const guardada = await updateAssistantConfig(tenantA.toString(), {
      tono: 'tono de A',
      systemPrompt: 'Prompt de A',
    });

    expect(guardada.version).not.toBe('1.0.0');
  });

  it('cada guardado sube la versión: la caché con el prompt viejo queda inalcanzable', async () => {
    const primera = await updateAssistantConfig(tenantA.toString(), {
      tono: 'v1',
      systemPrompt: 'Prompt v1',
    });
    const segunda = await updateAssistantConfig(tenantA.toString(), {
      tono: 'v2',
      systemPrompt: 'Prompt v2',
    });

    expect(segunda.version).not.toBe(primera.version);
  });

  it('sin plantilla global ni propia falla de forma explícita, no en silencio', async () => {
    await PromptTemplateModel.deleteMany({});

    await expect(getAssistantConfig(tenantA.toString())).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

/**
 * El seed de plantillas globales. La razón de existir de este archivo es la plantilla `classify`
 * que añadió HU-IA-03: sin ella `AIService.classify()` lanzaba `AppError(500)` en TODOS los
 * tenants, y el fallo estuvo latente hasta que un feature se apoyó en él.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), classify: vi.fn() }),
}));

import {
  CHAT_FRASE_DERIVACION,
  CHAT_SYSTEM_PROMPT,
  CHAT_TEMPLATE_VERSION,
  seedPromptTemplates,
} from './seed-prompt-templates.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';

async function global(method: string): Promise<IPromptTemplate | null> {
  return PromptTemplateModel.findOne({ tenantId: null, method }).lean<IPromptTemplate>();
}

describe('seedPromptTemplates — plantillas globales', () => {
  beforeEach(async () => {
    await PromptTemplateModel.deleteMany({});
  });

  it('siembra las cuatro plantillas globales, `classify` incluida', async () => {
    await seedPromptTemplates();

    for (const method of ['chat', 'summary', 'classify', 'extract']) {
      const tpl = await global(method);
      expect(tpl, `falta la plantilla global ${method}`).not.toBeNull();
      expect(tpl?.isActive).toBe(true);
      expect(tpl?.systemPrompt.length).toBeGreaterThan(0);
    }
  });

  it('la plantilla `classify` describe la escala del clasificador', async () => {
    await seedPromptTemplates();

    // `resolveTemplate` solo exige que exista, pero el prompt tiene que nombrar los tres niveles:
    // el proveedor los devuelve con `responseSchema`, y si el prompt no los explica el modelo
    // clasifica a ciegas.
    const tpl = await global('classify');
    for (const nivel of ['frio', 'tibio', 'caliente']) {
      expect(tpl?.systemPrompt).toContain(nivel);
    }
  });

  it('es idempotente y no pisa una edición posterior', async () => {
    await seedPromptTemplates();
    await PromptTemplateModel.updateOne(
      { tenantId: null, method: 'classify' },
      { $set: { systemPrompt: 'Prompt editado por la plataforma' } },
    );

    await seedPromptTemplates();

    expect((await global('classify'))?.systemPrompt).toBe('Prompt editado por la plataforma');
    expect(await PromptTemplateModel.countDocuments({ tenantId: null, method: 'classify' })).toBe(1);
  });

  it('no toca la plantilla `classify` propia de un tenant', async () => {
    const tenantId = new Types.ObjectId();
    await PromptTemplateModel.create({
      tenantId,
      method: 'classify',
      version: '1.0.0',
      isActive: true,
      systemPrompt: 'La escala de esta empresa',
    });

    await seedPromptTemplates();

    const propia = await PromptTemplateModel.findOne({ tenantId, method: 'classify' }).lean();
    expect(propia?.systemPrompt).toBe('La escala de esta empresa');
  });
});

describe('CHAT_FRASE_DERIVACION', () => {
  it('está contenida literalmente en el prompt de chat', async () => {
    // El disparador de baja confianza de HU-IA-03 compara la respuesta del modelo contra esta
    // frase. Si el prompt dejara de pedirla textualmente, la señal se rompería en silencio: el
    // handoff no saltaría nunca y nadie se enteraría.
    expect(CHAT_SYSTEM_PROMPT).toContain(CHAT_FRASE_DERIVACION);
  });

  it('extraerla no cambió la versión de la plantilla', async () => {
    // Componer el prompt con la constante no altera ni un carácter del texto, así que no hay
    // migración que hacer: la global ya sembrada sigue siendo válida.
    expect(CHAT_TEMPLATE_VERSION).toBe('1.1.0');
  });
});

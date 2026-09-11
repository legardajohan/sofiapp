/**
 * La migración de la plantilla global `chat` (HU-IA-02). Lo que hay que garantizar es tanto que
 * actualice la de fábrica como que NO toque la que haya escrito una empresa.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { migrarPlantillaChatGlobal } from './migrate-chat-template.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';
import { CHAT_SYSTEM_PROMPT, CHAT_TEMPLATE_VERSION } from '../seed/seed-prompt-templates.js';

const PROMPT_VIEJO = 'Prompt de la v1.0.0, sin la excepción para mensajes sociales.';

async function sembrarGlobal(version: string): Promise<void> {
  await PromptTemplateModel.create({
    tenantId: null,
    method: 'chat',
    version,
    isActive: true,
    systemPrompt: version === CHAT_TEMPLATE_VERSION ? CHAT_SYSTEM_PROMPT : PROMPT_VIEJO,
    tono: 'profesional, claro y cercano',
  });
}

describe('migrarPlantillaChatGlobal (HU-IA-02)', () => {
  beforeEach(async () => {
    await PromptTemplateModel.deleteMany({});
  });

  it('actualiza la global que sigue en 1.0.0', async () => {
    await sembrarGlobal('1.0.0');

    expect(await migrarPlantillaChatGlobal()).toBe('actualizada');

    const global = await PromptTemplateModel.findOne({ tenantId: null, method: 'chat' })
      .lean<IPromptTemplate>()
      .exec();
    expect(global?.version).toBe(CHAT_TEMPLATE_VERSION);
    expect(global?.systemPrompt).toContain('EXCEPCIÓN');
  });

  it('es idempotente: una segunda corrida no reescribe nada', async () => {
    await sembrarGlobal('1.0.0');
    await migrarPlantillaChatGlobal();

    expect(await migrarPlantillaChatGlobal()).toBe('ya-al-dia');
  });

  it('en dry-run informa pero no escribe', async () => {
    await sembrarGlobal('1.0.0');

    expect(await migrarPlantillaChatGlobal(true)).toBe('actualizada');

    const global = await PromptTemplateModel.findOne({ tenantId: null, method: 'chat' })
      .lean<IPromptTemplate>()
      .exec();
    expect(global?.version).toBe('1.0.0');
    expect(global?.systemPrompt).toBe(PROMPT_VIEJO);
  });

  it('NUNCA toca la plantilla de un tenant, aunque esté en 1.0.0', async () => {
    await sembrarGlobal('1.0.0');
    const tenantId = new Types.ObjectId();
    await PromptTemplateModel.create({
      tenantId,
      method: 'chat',
      version: '1.0.0',
      isActive: true,
      systemPrompt: 'Lo que escribió la empresa, y es su decisión.',
      tono: 'informal',
    });

    await migrarPlantillaChatGlobal();

    const propia = await PromptTemplateModel.findOne({ tenantId, method: 'chat' })
      .lean<IPromptTemplate>()
      .exec();
    expect(propia?.version).toBe('1.0.0');
    expect(propia?.systemPrompt).toBe('Lo que escribió la empresa, y es su decisión.');
  });

  it('sin plantilla global lo dice, en vez de crearla por su cuenta', async () => {
    expect(await migrarPlantillaChatGlobal()).toBe('no-existe');
  });
});

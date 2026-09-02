/**
 * La migración de la plantilla global `extract` (HU-IA-06).
 *
 * No es cosmética: `2.0.0` pide un cuarto campo (`interes`) y, sobre todo, es la primera versión
 * que el modelo llega a leer — hasta HU-IA-06 `AIService.extract` resolvía la plantilla y tiraba el
 * resultado. Quedarse en la vieja no rompe, pero el interés saldría vacío (o con el nivel de
 * interés, que es justo lo que no es), así que además cuenta las plantillas de tenant atrasadas.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { migrarPlantillaExtractGlobal } from './migrate-extract-template.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';
import { EXTRACT_SYSTEM_PROMPT, EXTRACT_TEMPLATE_VERSION } from '../seed/seed-prompt-templates.js';

const PROMPT_VIEJO = 'Prompt de la v1.0.0, sin nada del interés.';

async function sembrarGlobal(version: string): Promise<void> {
  await PromptTemplateModel.create({
    tenantId: null,
    method: 'extract',
    version,
    isActive: true,
    systemPrompt: version === EXTRACT_TEMPLATE_VERSION ? EXTRACT_SYSTEM_PROMPT : PROMPT_VIEJO,
  });
}

async function global(): Promise<IPromptTemplate | null> {
  return PromptTemplateModel.findOne({ tenantId: null, method: 'extract' })
    .lean<IPromptTemplate>()
    .exec();
}

describe('migrarPlantillaExtractGlobal (HU-IA-06)', () => {
  beforeEach(async () => {
    await PromptTemplateModel.deleteMany({});
  });

  it('actualiza la global que sigue en 1.0.0', async () => {
    await sembrarGlobal('1.0.0');

    const { resultado } = await migrarPlantillaExtractGlobal();

    expect(resultado).toBe('actualizada');
    const tpl = await global();
    expect(tpl?.version).toBe(EXTRACT_TEMPLATE_VERSION);
    expect(tpl?.systemPrompt).toContain('interes');
    // AC2: la plantilla tiene que decir explícitamente qué NO es el interés.
    expect(tpl?.systemPrompt).toContain('NO es cuánto le interesa');
  });

  it('es idempotente: una segunda corrida no reescribe nada', async () => {
    await sembrarGlobal('1.0.0');
    await migrarPlantillaExtractGlobal();

    expect((await migrarPlantillaExtractGlobal()).resultado).toBe('ya-al-dia');
  });

  it('en dry-run informa pero no escribe', async () => {
    await sembrarGlobal('1.0.0');

    expect((await migrarPlantillaExtractGlobal(true)).resultado).toBe('actualizada');

    const tpl = await global();
    expect(tpl?.version).toBe('1.0.0');
    expect(tpl?.systemPrompt).toBe(PROMPT_VIEJO);
  });

  it('NUNCA toca la plantilla de un tenant, pero la cuenta', async () => {
    await sembrarGlobal('1.0.0');
    const tenantId = new Types.ObjectId();
    await PromptTemplateModel.create({
      tenantId,
      method: 'extract',
      version: '1.0.0',
      isActive: true,
      systemPrompt: 'Lo que escribió la empresa, y es su decisión.',
    });

    const { tenantsDesactualizados } = await migrarPlantillaExtractGlobal();

    expect(tenantsDesactualizados).toBe(1);
    const propia = await PromptTemplateModel.findOne({ tenantId, method: 'extract' })
      .lean<IPromptTemplate>()
      .exec();
    expect(propia?.version).toBe('1.0.0');
    expect(propia?.systemPrompt).toBe('Lo que escribió la empresa, y es su decisión.');
  });

  it('no cuenta como desactualizada una plantilla de tenant ya en la versión nueva', async () => {
    await sembrarGlobal(EXTRACT_TEMPLATE_VERSION);
    await PromptTemplateModel.create({
      tenantId: new Types.ObjectId(),
      method: 'extract',
      version: EXTRACT_TEMPLATE_VERSION,
      isActive: true,
      systemPrompt: 'La suya, ya al día.',
    });

    expect((await migrarPlantillaExtractGlobal()).tenantsDesactualizados).toBe(0);
  });

  it('sin plantilla global lo dice, en vez de crearla por su cuenta', async () => {
    expect((await migrarPlantillaExtractGlobal()).resultado).toBe('no-existe');
  });
});

/**
 * La migración de la plantilla global `classify` (HU-IA-05).
 *
 * A diferencia de la de `chat`, esta no es cosmética: `2.0.0` cambia el contrato de salida (el
 * modelo pasa a devolver `confianza` y `motivo`). Quedarse en la versión vieja no rompe —el
 * servicio sanea a `confianza: 0`— pero entonces nunca se alcanza el umbral y el semáforo no se
 * mueve nunca. De ahí que además cuente las plantillas de tenant desactualizadas.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { migrarPlantillaClassifyGlobal } from './migrate-classify-template.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';
import { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_TEMPLATE_VERSION } from '../seed/seed-prompt-templates.js';

const PROMPT_VIEJO = 'Prompt de la v1.0.0, sin confianza ni motivo.';

async function sembrarGlobal(version: string): Promise<void> {
  await PromptTemplateModel.create({
    tenantId: null,
    method: 'classify',
    version,
    isActive: true,
    systemPrompt: version === CLASSIFY_TEMPLATE_VERSION ? CLASSIFY_SYSTEM_PROMPT : PROMPT_VIEJO,
  });
}

async function global(): Promise<IPromptTemplate | null> {
  return PromptTemplateModel.findOne({ tenantId: null, method: 'classify' })
    .lean<IPromptTemplate>()
    .exec();
}

describe('migrarPlantillaClassifyGlobal (HU-IA-05)', () => {
  beforeEach(async () => {
    await PromptTemplateModel.deleteMany({});
  });

  it('actualiza la global que sigue en 1.0.0', async () => {
    await sembrarGlobal('1.0.0');

    const { resultado } = await migrarPlantillaClassifyGlobal();

    expect(resultado).toBe('actualizada');
    const tpl = await global();
    expect(tpl?.version).toBe(CLASSIFY_TEMPLATE_VERSION);
    expect(tpl?.systemPrompt).toContain('CONFIANZA');
    expect(tpl?.systemPrompt).toContain('MOTIVO');
  });

  it('es idempotente: una segunda corrida no reescribe nada', async () => {
    await sembrarGlobal('1.0.0');
    await migrarPlantillaClassifyGlobal();

    expect((await migrarPlantillaClassifyGlobal()).resultado).toBe('ya-al-dia');
  });

  it('en dry-run informa pero no escribe', async () => {
    await sembrarGlobal('1.0.0');

    expect((await migrarPlantillaClassifyGlobal(true)).resultado).toBe('actualizada');

    const tpl = await global();
    expect(tpl?.version).toBe('1.0.0');
    expect(tpl?.systemPrompt).toBe(PROMPT_VIEJO);
  });

  it('NUNCA toca la plantilla de un tenant, pero la cuenta', async () => {
    await sembrarGlobal('1.0.0');
    const tenantId = new Types.ObjectId();
    await PromptTemplateModel.create({
      tenantId,
      method: 'classify',
      version: '1.0.0',
      isActive: true,
      systemPrompt: 'Lo que escribió la empresa, y es su decisión.',
    });

    const { tenantsDesactualizados } = await migrarPlantillaClassifyGlobal();

    expect(tenantsDesactualizados).toBe(1);
    const propia = await PromptTemplateModel.findOne({ tenantId, method: 'classify' })
      .lean<IPromptTemplate>()
      .exec();
    expect(propia?.version).toBe('1.0.0');
    expect(propia?.systemPrompt).toBe('Lo que escribió la empresa, y es su decisión.');
  });

  it('no cuenta como desactualizada una plantilla de tenant ya en la versión nueva', async () => {
    await sembrarGlobal(CLASSIFY_TEMPLATE_VERSION);
    await PromptTemplateModel.create({
      tenantId: new Types.ObjectId(),
      method: 'classify',
      version: CLASSIFY_TEMPLATE_VERSION,
      isActive: true,
      systemPrompt: 'La suya, ya al día.',
    });

    expect((await migrarPlantillaClassifyGlobal()).tenantsDesactualizados).toBe(0);
  });

  it('sin plantilla global lo dice, en vez de crearla por su cuenta', async () => {
    expect((await migrarPlantillaClassifyGlobal()).resultado).toBe('no-existe');
  });
});

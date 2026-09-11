/**
 * Migración HU-IA-02: actualiza la plantilla GLOBAL `chat` a `CHAT_TEMPLATE_VERSION`.
 *
 * Hace falta un script y no basta el seed porque `seedPromptTemplates` usa `$setOnInsert`,
 * precisamente para no pisar lo que un admin haya editado. Esa protección tiene el efecto lateral
 * de que la global ya sembrada nunca se actualiza sola.
 *
 * NUNCA toca la plantilla de un tenant: si una empresa ya escribió la suya desde
 * /settings/assistant, esa redacción es suya y una migración no tiene por qué opinar.
 *
 * Idempotente: si la global ya está en la versión objetivo, no escribe nada.
 *
 * Uso:
 *   pnpm --filter @sofiapp/api migrate:chat-template -- --dry-run   (solo informa)
 *   pnpm --filter @sofiapp/api migrate:chat-template
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';
import { CHAT_SYSTEM_PROMPT, CHAT_TEMPLATE_VERSION } from '../seed/seed-prompt-templates.js';

export type ResultadoMigracion = 'actualizada' | 'ya-al-dia' | 'no-existe';

/**
 * El filtro lleva `tenantId: null` explícito, que es lo que acota la escritura a la plantilla de
 * fábrica. Es la misma excepción documentada que usa `AIService.resolveTemplate` para leerla.
 */
export async function migrarPlantillaChatGlobal(dryRun = false): Promise<ResultadoMigracion> {
  const global = await PromptTemplateModel.findOne({ tenantId: null, method: 'chat' })
    .lean<IPromptTemplate>()
    .exec();

  if (!global) return 'no-existe';
  if (global.version === CHAT_TEMPLATE_VERSION) return 'ya-al-dia';
  if (dryRun) return 'actualizada';

  await PromptTemplateModel.updateOne(
    { tenantId: null, method: 'chat' },
    { $set: { systemPrompt: CHAT_SYSTEM_PROMPT, version: CHAT_TEMPLATE_VERSION } },
  );
  return 'actualizada';
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Conectado a MongoDB', { dryRun });

  const resultado = await migrarPlantillaChatGlobal(dryRun);

  const mensajes: Record<ResultadoMigracion, string> = {
    actualizada: dryRun
      ? `La plantilla global 'chat' se actualizaría a ${CHAT_TEMPLATE_VERSION}.`
      : `Plantilla global 'chat' actualizada a ${CHAT_TEMPLATE_VERSION}.`,
    'ya-al-dia': `La plantilla global 'chat' ya está en ${CHAT_TEMPLATE_VERSION}. Nada que hacer.`,
    'no-existe':
      "No hay plantilla global 'chat'. Arranca el backend una vez para que el seed la cree.",
  };
  logger.info(mensajes[resultado]);

  await mongoose.disconnect();
}

// Solo corre como script; importarlo desde un test no dispara la migración.
if (process.argv[1]?.includes('migrate-chat-template')) {
  main().catch((err: unknown) => {
    logger.error('Fallo la migración de la plantilla de chat', { error: String(err) });
    process.exit(1);
  });
}

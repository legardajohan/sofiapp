/**
 * Migración HU-IA-06: actualiza la plantilla GLOBAL `extract` a `EXTRACT_TEMPLATE_VERSION`.
 *
 * Hace falta un script y no basta el seed porque `seedPromptTemplates` usa `$setOnInsert`,
 * precisamente para no pisar lo que un admin haya editado. Esa protección tiene el efecto lateral
 * de que la global ya sembrada nunca se actualiza sola.
 *
 * No es cosmética: `2.0.0` pide un cuarto campo (`interes`) y, sobre todo, es la primera versión
 * que el modelo llega a leer — hasta HU-IA-06 `AIService.extract` resolvía la plantilla y tiraba el
 * resultado. Sin esta migración, una base ya sembrada manda al modelo el prompt viejo, que no dice
 * nada del interés: el campo saldría vacío o con el nivel de interés, que es justo lo que no es.
 *
 * NUNCA toca la plantilla de un tenant: si una empresa ya escribió la suya desde
 * /settings/assistant, esa redacción es suya y una migración no tiene por qué opinar. Sí las
 * cuenta e informa, porque una plantilla de tenant en la versión vieja tiene el problema descrito
 * arriba y su dueño debería saberlo.
 *
 * Idempotente: si la global ya está en la versión objetivo, no escribe nada.
 *
 * Uso:
 *   pnpm --filter @sofiapp/api migrate:extract-template -- --dry-run   (solo informa)
 *   pnpm --filter @sofiapp/api migrate:extract-template
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';
import { EXTRACT_SYSTEM_PROMPT, EXTRACT_TEMPLATE_VERSION } from '../seed/seed-prompt-templates.js';

export type ResultadoMigracion = 'actualizada' | 'ya-al-dia' | 'no-existe';

export interface InformeMigracion {
  resultado: ResultadoMigracion;
  /** Plantillas de tenant que siguen en una versión anterior. No se tocan: solo se informan. */
  tenantsDesactualizados: number;
}

/**
 * El filtro lleva `tenantId: null` explícito, que es lo que acota la escritura a la plantilla de
 * fábrica. Es la misma excepción documentada que usa `AIService.resolveTemplate` para leerla.
 */
export async function migrarPlantillaExtractGlobal(dryRun = false): Promise<InformeMigracion> {
  const tenantsDesactualizados = await PromptTemplateModel.countDocuments({
    tenantId: { $ne: null },
    method: 'extract',
    version: { $ne: EXTRACT_TEMPLATE_VERSION },
  });

  const global = await PromptTemplateModel.findOne({ tenantId: null, method: 'extract' })
    .lean<IPromptTemplate>()
    .exec();

  if (!global) return { resultado: 'no-existe', tenantsDesactualizados };
  if (global.version === EXTRACT_TEMPLATE_VERSION) {
    return { resultado: 'ya-al-dia', tenantsDesactualizados };
  }
  if (dryRun) return { resultado: 'actualizada', tenantsDesactualizados };

  await PromptTemplateModel.updateOne(
    { tenantId: null, method: 'extract' },
    { $set: { systemPrompt: EXTRACT_SYSTEM_PROMPT, version: EXTRACT_TEMPLATE_VERSION } },
  );
  return { resultado: 'actualizada', tenantsDesactualizados };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Conectado a MongoDB', { dryRun });

  const { resultado, tenantsDesactualizados } = await migrarPlantillaExtractGlobal(dryRun);

  const mensajes: Record<ResultadoMigracion, string> = {
    actualizada: dryRun
      ? `La plantilla global 'extract' se actualizaría a ${EXTRACT_TEMPLATE_VERSION}.`
      : `Plantilla global 'extract' actualizada a ${EXTRACT_TEMPLATE_VERSION}.`,
    'ya-al-dia': `La plantilla global 'extract' ya está en ${EXTRACT_TEMPLATE_VERSION}. Nada que hacer.`,
    'no-existe':
      "No hay plantilla global 'extract'. Arranca el backend una vez para que el seed la cree.",
  };
  logger.info(mensajes[resultado]);

  if (tenantsDesactualizados > 0) {
    logger.warn(
      `${tenantsDesactualizados} plantilla(s) 'extract' de tenant siguen en una versión anterior. ` +
        'No se tocan (son personalizaciones del cliente), pero no dicen nada del campo "interes", ' +
        'así que sus extracciones lo devolverán vacío hasta que las actualicen.',
    );
  }

  await mongoose.disconnect();
}

// Solo corre como script; importarlo desde un test no dispara la migración.
if (process.argv[1]?.includes('migrate-extract-template')) {
  main().catch((err: unknown) => {
    logger.error('Falló la migración de la plantilla de extracción', { error: String(err) });
    process.exit(1);
  });
}

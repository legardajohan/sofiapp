/**
 * Migración HU-IA-05: actualiza la plantilla GLOBAL `classify` a `CLASSIFY_TEMPLATE_VERSION`.
 *
 * Hace falta un script y no basta el seed porque `seedPromptTemplates` usa `$setOnInsert`,
 * precisamente para no pisar lo que un admin haya editado. Esa protección tiene el efecto lateral
 * de que la global ya sembrada nunca se actualiza sola.
 *
 * A diferencia de la migración de `chat`, esta no es cosmética: `2.0.0` cambia el CONTRATO de
 * salida —el modelo pasa a devolver `confianza` y `motivo`— y sin ella la semaforización automática
 * clasifica con el prompt viejo, que no pide ninguno de los dos. El resultado no rompe (el servicio
 * sanea a `confianza: 0`), pero nunca alcanza el umbral y el semáforo no se mueve nunca.
 *
 * NUNCA toca la plantilla de un tenant: si una empresa ya escribió la suya desde
 * /settings/assistant, esa redacción es suya y una migración no tiene por qué opinar. Sí las
 * cuenta e informa, porque una plantilla de tenant en la versión vieja tiene el problema descrito
 * arriba y su dueño debería saberlo.
 *
 * Idempotente: si la global ya está en la versión objetivo, no escribe nada.
 *
 * Uso:
 *   pnpm --filter @sofiapp/api migrate:classify-template -- --dry-run   (solo informa)
 *   pnpm --filter @sofiapp/api migrate:classify-template
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { PromptTemplateModel, type IPromptTemplate } from '../services/ai/prompt-template.model.js';
import { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_TEMPLATE_VERSION } from '../seed/seed-prompt-templates.js';

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
export async function migrarPlantillaClassifyGlobal(dryRun = false): Promise<InformeMigracion> {
  const tenantsDesactualizados = await PromptTemplateModel.countDocuments({
    tenantId: { $ne: null },
    method: 'classify',
    version: { $ne: CLASSIFY_TEMPLATE_VERSION },
  });

  const global = await PromptTemplateModel.findOne({ tenantId: null, method: 'classify' })
    .lean<IPromptTemplate>()
    .exec();

  if (!global) return { resultado: 'no-existe', tenantsDesactualizados };
  if (global.version === CLASSIFY_TEMPLATE_VERSION) {
    return { resultado: 'ya-al-dia', tenantsDesactualizados };
  }
  if (dryRun) return { resultado: 'actualizada', tenantsDesactualizados };

  await PromptTemplateModel.updateOne(
    { tenantId: null, method: 'classify' },
    { $set: { systemPrompt: CLASSIFY_SYSTEM_PROMPT, version: CLASSIFY_TEMPLATE_VERSION } },
  );
  return { resultado: 'actualizada', tenantsDesactualizados };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Conectado a MongoDB', { dryRun });

  const { resultado, tenantsDesactualizados } = await migrarPlantillaClassifyGlobal(dryRun);

  const mensajes: Record<ResultadoMigracion, string> = {
    actualizada: dryRun
      ? `La plantilla global 'classify' se actualizaría a ${CLASSIFY_TEMPLATE_VERSION}.`
      : `Plantilla global 'classify' actualizada a ${CLASSIFY_TEMPLATE_VERSION}.`,
    'ya-al-dia': `La plantilla global 'classify' ya está en ${CLASSIFY_TEMPLATE_VERSION}. Nada que hacer.`,
    'no-existe':
      "No hay plantilla global 'classify'. Arranca el backend una vez para que el seed la cree.",
  };
  logger.info(mensajes[resultado]);

  if (tenantsDesactualizados > 0) {
    logger.warn(
      `${tenantsDesactualizados} plantilla(s) 'classify' de tenant siguen en una versión anterior. ` +
        'No se tocan (son personalizaciones del cliente), pero clasificarán sin pedir confianza ni ' +
        'motivo, así que su semáforo no se moverá solo hasta que las actualicen.',
    );
  }

  await mongoose.disconnect();
}

// Solo corre como script; importarlo desde un test no dispara la migración.
if (process.argv[1]?.includes('migrate-classify-template')) {
  main().catch((err: unknown) => {
    logger.error('Falló la migración de la plantilla de clasificación', { error: String(err) });
    process.exit(1);
  });
}

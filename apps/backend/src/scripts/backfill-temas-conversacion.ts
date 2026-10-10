/**
 * Backfill del tema por conversación (HU-REP-03).
 *
 * El clasificador en línea solo ve las conversaciones que la IA atiende y solo desde que se
 * despliega. Este script recorre el histórico —y los hilos que lleva un asesor— para que
 * «Productos más consultados» no arranque vacío.
 *
 * **Idempotente**: pasa por el MISMO guard y el mismo freno de coste que el clasificador en línea
 * (`clasificarTemaSiHaceFalta`). Re-ejecutarlo no reclasifica lo que ya está al día, y un fallo
 * (429 de Gemini, por ejemplo) se cuenta y se recoge en la siguiente corrida.
 *
 * Uso:
 *   pnpm --filter @sofiapp/api backfill:temas -- --dry-run
 *   pnpm --filter @sofiapp/api backfill:temas -- [--tenant <id>] [--desde YYYY-MM-DD] [--limite N] [--pausa-ms 1500]
 *
 * `--desde` por defecto = hoy − 90 días (por `ultimoMensajeAt`). `--pausa-ms` va entre llamadas
 * efectivas al modelo, para no agotar la cuota de Gemini.
 */
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { findScoped } from '../repositories/base.repository.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { PREFIJO_CLIENTE_DEMO } from '../features/reports/reports.types.js';
import { DIA_MS } from '../utils/date-range.util.js';
import { seedPromptTemplates } from '../seed/seed-prompt-templates.js';
import {
  clasificarTemaSiHaceFalta,
  necesitaClasificarTema,
} from '../features/ai/ai-topic.service.js';

export const DESDE_DEFAULT_DIAS = 90;
export const PAUSA_DEFAULT_MS = 1500;

export interface OpcionesBackfill {
  /** Un solo tenant; sin él, todos. */
  tenantId?: string;
  desde: Date;
  /** Tope de conversaciones a recorrer en toda la corrida. */
  limite?: number;
  pausaMs: number;
  dryRun: boolean;
}

export interface ResumenBackfill {
  /** Conversaciones no demo con actividad desde `desde`. */
  candidatos: number;
  /** En `--dry-run`, las que SE clasificarían: superan el guard y el freno. */
  clasificadas: number;
  saltadas: number;
  fallidas: number;
}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function tenantsARecorrer(tenantId?: string): Promise<string[]> {
  if (tenantId) return [tenantId];
  // Excepción del script de sistema: la lista de tenants no es dato de ningún tenant. Todo lo que
  // se lee DENTRO de cada uno va por `*Scoped`.
  const tenants = await Tenant.find({}, { _id: 1 }).lean<Array<{ _id: Types.ObjectId }>>();
  return tenants.map((t) => String(t._id));
}

/** Recorre en serie: en paralelo, la cuota de Gemini se agotaría en la primera ráfaga. */
export async function backfillTemas(opts: OpcionesBackfill): Promise<ResumenBackfill> {
  const resumen: ResumenBackfill = { candidatos: 0, clasificadas: 0, saltadas: 0, fallidas: 0 };

  for (const tenantId of await tenantsARecorrer(opts.tenantId)) {
    const restantes = opts.limite === undefined ? undefined : opts.limite - resumen.candidatos;
    if (restantes !== undefined && restantes <= 0) break;

    let consulta = findScoped(Cliente, tenantId, {
      ultimoMensajeAt: { $gte: opts.desde },
      metaUserId: { $not: PREFIJO_CLIENTE_DEMO },
    })
      .select({ _id: 1 })
      .sort({ ultimoMensajeAt: -1 });
    if (restantes !== undefined) consulta = consulta.limit(restantes);
    const clientes = await consulta.lean<Array<{ _id: Types.ObjectId }>>();

    for (const { _id } of clientes) {
      resumen.candidatos += 1;
      const clienteId = String(_id);

      if (opts.dryRun) {
        if (await necesitaClasificarTema(tenantId, clienteId)) resumen.clasificadas += 1;
        else resumen.saltadas += 1;
        continue;
      }

      const resultado = await clasificarTemaSiHaceFalta(tenantId, clienteId);
      if (resultado === 'clasificada') resumen.clasificadas += 1;
      else if (resultado === 'saltada') resumen.saltadas += 1;
      else resumen.fallidas += 1;

      // Solo entre llamadas efectivas: una saltada no tocó el modelo y no gasta cuota.
      if (resultado !== 'saltada' && opts.pausaMs > 0) await dormir(opts.pausaMs);
    }
  }
  return resumen;
}

function valorDe(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Lee la línea de comandos. Lanza ante un valor inválido: mejor no arrancar que recorrer mal. */
export function parsearArgs(args: string[], now: Date = new Date()): OpcionesBackfill {
  const tenantId = valorDe(args, '--tenant');
  if (tenantId !== undefined && !Types.ObjectId.isValid(tenantId)) {
    throw new Error(`--tenant no es un id válido: ${tenantId}`);
  }

  const desdeRaw = valorDe(args, '--desde');
  const desde = desdeRaw ? new Date(desdeRaw) : new Date(now.getTime() - DESDE_DEFAULT_DIAS * DIA_MS);
  if (Number.isNaN(desde.getTime())) throw new Error(`--desde no es una fecha válida: ${desdeRaw}`);

  const limiteRaw = valorDe(args, '--limite');
  const limite = limiteRaw === undefined ? undefined : Number(limiteRaw);
  if (limite !== undefined && (!Number.isInteger(limite) || limite <= 0)) {
    throw new Error(`--limite debe ser un entero positivo: ${limiteRaw}`);
  }

  const pausaRaw = valorDe(args, '--pausa-ms');
  const pausaMs = pausaRaw === undefined ? PAUSA_DEFAULT_MS : Number(pausaRaw);
  if (!Number.isFinite(pausaMs) || pausaMs < 0) throw new Error(`--pausa-ms inválido: ${pausaRaw}`);

  return {
    ...(tenantId ? { tenantId } : {}),
    desde,
    ...(limite !== undefined ? { limite } : {}),
    pausaMs,
    dryRun: args.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  const opts = parsearArgs(process.argv.slice(2));
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    // Idempotente: garantiza la plantilla `topic` aunque el backend no se haya reiniciado aún.
    await seedPromptTemplates();
    logger.info('Backfill de temas: arranca', { ...opts, desde: opts.desde.toISOString() });
    const resumen = await backfillTemas(opts);
    logger.info(
      opts.dryRun ? 'Backfill de temas (simulacro, sin escribir).' : 'Backfill de temas completado.',
      { ...resumen },
    );
  } finally {
    await mongoose.disconnect();
  }
}

// Solo corre como script; importarlo desde un test no dispara la corrida.
if (process.argv[1]?.includes('backfill-temas-conversacion')) {
  main()
    // `exit` explícito: la conexión de Redis del singleton de IA mantendría vivo el proceso.
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error('Backfill de temas fallido.', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}

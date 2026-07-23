import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Plan } from '../features/plan/plan.model.js';

// Migración de ÍNDICES del catálogo de planes (HU-SAAS-02).
//
// Contexto: el índice único cambió de `nombre` (global) a `(nombre, periodicidad)`, para permitir
// un mismo nombre en periodicidades distintas. `autoIndex` crea el índice nuevo pero NO elimina el
// viejo `nombre_1`, que seguiría rechazando nombres repetidos (E11000). Este script deja los índices
// del modelo sincronizados: elimina los que ya no están en el esquema y crea los que faltan.
//
// Uso (NO se ejecuta en el arranque de la app):
//   pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/fix-plan-indexes.ts
//
// Es idempotente: correrlo varias veces no cambia nada tras la primera vez.

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  try {
    const antes = await Plan.collection.indexes();
    logger.info('[fix-plan-indexes] Índices ANTES', { indexes: antes.map((i) => i.name) });

    // `syncIndexes` construye los índices declarados en el esquema y elimina los que sobran
    // (aquí, el legacy `nombre_1`). Devuelve los nombres de índices eliminados.
    const dropped = await Plan.syncIndexes();
    logger.info('[fix-plan-indexes] syncIndexes completado', { dropped });

    const despues = await Plan.collection.indexes();
    logger.info('[fix-plan-indexes] Índices DESPUÉS', { indexes: despues.map((i) => i.name) });
  } finally {
    await mongoose.disconnect();
  }
}

// Ejecutar solo cuando se invoca directamente (no al importarse en tests/otros módulos).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

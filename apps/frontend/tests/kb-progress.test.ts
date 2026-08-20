/**
 * Test de lógica pura para la barra de progreso de la KB (HU-KB-01-V3.1 — fix del contador).
 *
 * Lo corre vitest como cualquier otra suite. Las aserciones siguen siendo `node:assert`: es lógica
 * pura, no necesita matchers de DOM. Vive FUERA de `src/` para no entrar en `tsc --noEmit` (build)
 * ni en `eslint src` (lint).
 *
 * Antes declaraba su propio `test()` con `console.log` y estaba pensado para lanzarse a mano con
 * `tsx`. Vitest lo recogía igual por el nombre `*.test.ts` y lo reportaba como suite fallida («No
 * test suite found»), así que en la práctica sus aserciones nunca corrían: se quedó apuntando al
 * título viejo de un preset renombrado sin que nadie se enterara.
 *
 * Cubre que el progreso se calcule sobre la lista FUSIONADA (`mergePresetsWithDocuments`), no la
 * cruda del API: así el denominador de obligatorios queda fijo en 2 y la barra no desaparece.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  computeKbProgress,
  mergePresetsWithDocuments,
  PRESET_META,
} from '../src/features/knowledge-base/lib/kb-presets.js';
import type { EstadoIndexacion, IKbDocument } from '../src/features/knowledge-base/types/index.js';

const OBLIGATORIO_A = 'Información de la empresa';
const OBLIGATORIO_B = 'Productos y servicios';
const OPCIONAL = 'Información Complementaria';

/**
 * Modela un documento tal cual lo devuelve el API. Por defecto simula un preset **creado vía POST**
 * (`isPreset:false`, `obligatorio:false`): es el caso que rompía los denominadores, porque el backend
 * de creación no setea esos flags. El merge debe re-imponer la identidad de preset por título.
 */
function makeDoc(overrides: Partial<IKbDocument> & { titulo: string }): IKbDocument {
  const now = new Date().toISOString();
  return {
    id: `id-${overrides.titulo}`,
    contenido: 'contenido de ejemplo',
    estadoIndexacion: 'indexado',
    version: 1,
    chunkCount: 3,
    isPreset: false,
    obligatorio: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Progreso calculado igual que la página: sobre la lista fusionada. */
function progressFrom(documents: IKbDocument[]): ReturnType<typeof computeKbProgress> {
  return computeKbProgress(mergePresetsWithDocuments(documents));
}

test('al eliminar TODOS los documentos, el contador se mantiene en 0/2 y la barra no desaparece', () => {
  const progress = progressFrom([]);
  // Denominador fijo: los 2 obligatorios de PRESET_META siempre presentes (aunque no exista ningún doc).
  assert.equal(progress.obligatorios.length, 2, 'denominador de obligatorios debe ser 2');
  assert.equal(progress.completedObligatorios, 0, 'numerador de obligatorios debe ser 0');
  // La barra global solo se oculta si totalPresets === 0; con la fusión siempre son 5.
  assert.equal(progress.totalPresets, 5, 'totalPresets debe ser 5 (barra visible)');
  assert.equal(progress.completedPresets, 0);
});

test('la lista fusionada siempre expone las 5 categorías', () => {
  assert.equal(mergePresetsWithDocuments([]).length, 5);
  assert.equal(progressFrom([]).presets.length, 5);
});

test('el contador X/2 solo refleja los 2 obligatorios, sin importar cuántos opcionales existan', () => {
  // 1 opcional indexado + 1 obligatorio indexado; el otro obligatorio no existe (eliminado).
  const documents = [
    makeDoc({ titulo: OPCIONAL, obligatorio: false, estadoIndexacion: 'indexado' }),
    makeDoc({ titulo: OBLIGATORIO_A, obligatorio: true, estadoIndexacion: 'indexado' }),
  ];
  const progress = progressFrom(documents);
  assert.equal(progress.obligatorios.length, 2, 'el opcional no infla el denominador');
  assert.equal(progress.completedObligatorios, 1, 'solo cuenta el obligatorio indexado → 1/2');
});

test('completedObligatorios cuenta solo "indexado", no "procesando" ni "pendiente"', () => {
  const estados: EstadoIndexacion[] = ['procesando', 'pendiente', 'fallido'];
  for (const estado of estados) {
    const documents = [
      makeDoc({ titulo: OBLIGATORIO_A, obligatorio: true, estadoIndexacion: estado }),
      makeDoc({ titulo: OBLIGATORIO_B, obligatorio: true, estadoIndexacion: estado }),
    ];
    const progress = progressFrom(documents);
    assert.equal(
      progress.completedObligatorios,
      0,
      `estado "${estado}" no debe contar como completado`,
    );
    assert.equal(progress.obligatorios.length, 2);
  }
});

test('ambos obligatorios indexados → 2/2', () => {
  const documents = [
    makeDoc({ titulo: OBLIGATORIO_A, estadoIndexacion: 'indexado' }),
    makeDoc({ titulo: OBLIGATORIO_B, estadoIndexacion: 'indexado' }),
  ];
  const progress = progressFrom(documents);
  assert.equal(progress.completedObligatorios, 2);
  assert.equal(progress.obligatorios.length, 2);
});

// ── Reproducción exacta del bug reportado ──────────────────────────────────────────────────────
// Un preset completado que nace por POST (isPreset:false/obligatorio:false) NO debe caerse de los
// conteos: los denominadores siguen fijos en 5 y 2, solo sube el numerador.

test('REPRO: 0/5 y 0/2 → completar un obligatorio creado por POST → 1/5 y 1/2 (no 0/4 ni 0/1)', () => {
  // Estado inicial: sin documentos → 0/5 y 0/2.
  const inicial = progressFrom([]);
  assert.equal(inicial.completedPresets, 0);
  assert.equal(inicial.totalPresets, 5);
  assert.equal(inicial.completedObligatorios, 0);
  assert.equal(inicial.obligatorios.length, 2);

  // Se completa "Información de la empresa" como documento creado por POST (sin flags de preset).
  const progress = progressFrom([
    makeDoc({ titulo: OBLIGATORIO_A, isPreset: false, obligatorio: false, estadoIndexacion: 'indexado' }),
  ]);

  assert.equal(progress.totalPresets, 5, 'denominador de documentos fijo en 5');
  assert.equal(progress.completedPresets, 1, 'numerador de documentos → 1/5');
  assert.equal(progress.obligatorios.length, 2, 'denominador de obligatorios fijo en 2');
  assert.equal(progress.completedObligatorios, 1, 'numerador de obligatorios → 1/2');

  // El banner solo debe listar el obligatorio que sigue pendiente, sin afectar el denominador.
  assert.equal(progress.missingObligatorios.length, 1);
  assert.equal(progress.missingObligatorios[0]?.titulo, OBLIGATORIO_B);
});

test('completar/eliminar un OPCIONAL mueve X/5 pero deja X/2 obligatorios intacto', () => {
  // Solo un opcional completado, ningún obligatorio.
  const progress = progressFrom([
    makeDoc({ titulo: OPCIONAL, isPreset: false, obligatorio: false, estadoIndexacion: 'indexado' }),
  ]);
  assert.equal(progress.completedPresets, 1, 'el opcional sí mueve X/5');
  assert.equal(progress.totalPresets, 5);
  assert.equal(progress.obligatorios.length, 2, 'denominador de obligatorios intacto (2)');
  assert.equal(progress.completedObligatorios, 0, 'un opcional NO mueve el numerador de X/2');
});

test('completar dos presets obligatorios → 2/5 y 2/2', () => {
  const progress = progressFrom([
    makeDoc({ titulo: OBLIGATORIO_A, isPreset: false, obligatorio: false, estadoIndexacion: 'indexado' }),
    makeDoc({ titulo: OBLIGATORIO_B, isPreset: false, obligatorio: false, estadoIndexacion: 'indexado' }),
  ]);
  assert.equal(progress.completedPresets, 2);
  assert.equal(progress.totalPresets, 5);
  assert.equal(progress.completedObligatorios, 2);
  assert.equal(progress.obligatorios.length, 2);
  assert.equal(progress.missingObligatorios.length, 0);
});

test('completar los CINCO presets → 5/5 y 2/2', () => {
  const documents = PRESET_META.map((meta) =>
    makeDoc({ titulo: meta.titulo, isPreset: false, obligatorio: false, estadoIndexacion: 'indexado' }),
  );
  const progress = progressFrom(documents);
  assert.equal(progress.totalPresets, 5);
  assert.equal(progress.completedPresets, 5);
  assert.equal(progress.obligatorios.length, 2);
  assert.equal(progress.completedObligatorios, 2);
  assert.equal(progress.missingObligatorios.length, 0);
});

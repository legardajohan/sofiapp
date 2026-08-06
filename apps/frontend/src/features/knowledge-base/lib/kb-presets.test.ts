/**
 * Lógica pura de la base de conocimiento: fusión de presets, contadores de progreso, colisión de
 * títulos y versión de destino.
 *
 * Es el archivo más compartido del feature (lo consumen la grilla, el progreso, el banner y el
 * modal), así que aquí es donde vive la cobertura de regresión de HU-KB-05. Migrado desde
 * `apps/frontend/tests/kb-progress.test.ts` (HU-KB-01-V3.1), que corría con `node:assert` fuera de
 * `src/` para no entrar en `tsc --noEmit` ni en `eslint`; ahora entra en ambos, como el resto.
 */
import { describe, it, expect } from 'vitest';
import {
  buildKbGrid,
  computeKbProgress,
  isTitleTaken,
  mergePresetsWithDocuments,
  nextVersion,
  normalizeTitulo,
  PRESET_META,
  PRESET_ORDER,
  VIRTUAL_PRESET_ID_PREFIX,
} from './kb-presets.js';
import type { EstadoIndexacion, IKbDocument } from '../types/index.js';

const OBLIGATORIO_A = 'Información de la empresa';
const OBLIGATORIO_B = 'Productos y servicios';
/** Preset no obligatorio. Ojo: hasta HU-KB-05 esta constante decía 'Preguntas frecuentes', título
 *  que dejó de ser preset al renombrarse a 'Información Complementaria' — de ahí el rojo previo. */
const OPCIONAL = 'Información Complementaria';
/** Documento propio del tenant: no corresponde a ninguna categoría predefinida. */
const LIBRE = 'Convenios con empresas';

/**
 * Modela un documento tal cual lo devuelve el API. Por defecto simula un preset **creado vía POST**
 * (`isPreset:false`, `obligatorio:false`): es el caso que rompía los denominadores, porque el backend
 * de creación no setea esos flags. El merge debe re-imponer la identidad de preset por título.
 */
function makeDoc(overrides: Partial<IKbDocument> & { titulo: string }): IKbDocument {
  return {
    id: `id-${overrides.titulo}`,
    contenido: 'contenido de ejemplo',
    estadoIndexacion: 'indexado',
    version: 1,
    chunkCount: 3,
    isPreset: false,
    obligatorio: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Progreso calculado igual que la página: sobre la lista de la grilla. */
function progressFrom(documents: IKbDocument[]): ReturnType<typeof computeKbProgress> {
  return computeKbProgress(buildKbGrid(documents));
}

describe('computeKbProgress — contador de obligatorios (denominador fijo)', () => {
  it('al eliminar TODOS los documentos se mantiene en 0/2 y la barra no desaparece', () => {
    const progress = progressFrom([]);
    // Denominador fijo: los 2 obligatorios de PRESET_META siempre presentes, exista o no un doc.
    expect(progress.obligatorios).toHaveLength(2);
    expect(progress.completedObligatorios).toBe(0);
    expect(progress.totalPresets).toBe(5);
    expect(progress.completedPresets).toBe(0);
  });

  it('la lista fusionada siempre expone las 5 categorías', () => {
    expect(mergePresetsWithDocuments([])).toHaveLength(5);
    expect(progressFrom([]).presets).toHaveLength(5);
  });

  it('X/2 solo refleja los 2 obligatorios, sin importar cuántos otros documentos existan', () => {
    const progress = progressFrom([
      makeDoc({ titulo: OPCIONAL, estadoIndexacion: 'indexado' }),
      makeDoc({ titulo: LIBRE, estadoIndexacion: 'indexado' }),
      makeDoc({ titulo: OBLIGATORIO_A, estadoIndexacion: 'indexado' }),
    ]);
    expect(progress.obligatorios).toHaveLength(2);
    expect(progress.completedObligatorios).toBe(1);
  });

  it('cuenta solo "indexado", no "procesando" ni "pendiente" ni "fallido"', () => {
    const estados: EstadoIndexacion[] = ['procesando', 'pendiente', 'fallido'];
    for (const estado of estados) {
      const progress = progressFrom([
        makeDoc({ titulo: OBLIGATORIO_A, estadoIndexacion: estado }),
        makeDoc({ titulo: OBLIGATORIO_B, estadoIndexacion: estado }),
      ]);
      expect(progress.completedObligatorios, `estado "${estado}"`).toBe(0);
      expect(progress.obligatorios).toHaveLength(2);
    }
  });

  it('ambos obligatorios indexados → 2/2', () => {
    const progress = progressFrom([
      makeDoc({ titulo: OBLIGATORIO_A, estadoIndexacion: 'indexado' }),
      makeDoc({ titulo: OBLIGATORIO_B, estadoIndexacion: 'indexado' }),
    ]);
    expect(progress.completedObligatorios).toBe(2);
    expect(progress.obligatorios).toHaveLength(2);
  });

  // Reproducción exacta del bug de HU-KB-01-V3: un preset completado que nace por POST
  // (isPreset:false/obligatorio:false) NO debe caerse de los conteos.
  it('REPRO: completar un obligatorio creado por POST → 1/5 y 1/2 (no 0/4 ni 0/1)', () => {
    const inicial = progressFrom([]);
    expect(inicial.completedPresets).toBe(0);
    expect(inicial.completedObligatorios).toBe(0);

    const progress = progressFrom([
      makeDoc({ titulo: OBLIGATORIO_A, isPreset: false, obligatorio: false, estadoIndexacion: 'indexado' }),
    ]);

    expect(progress.totalPresets).toBe(5);
    expect(progress.completedPresets).toBe(1);
    expect(progress.obligatorios).toHaveLength(2);
    expect(progress.completedObligatorios).toBe(1);
    // El banner solo lista el obligatorio que sigue pendiente, sin afectar el denominador.
    expect(progress.missingObligatorios).toHaveLength(1);
    expect(progress.missingObligatorios[0]?.titulo).toBe(OBLIGATORIO_B);
  });

  it('completar un preset OPCIONAL mueve X/5 pero deja X/2 intacto', () => {
    const progress = progressFrom([makeDoc({ titulo: OPCIONAL, estadoIndexacion: 'indexado' })]);
    expect(progress.completedPresets).toBe(1);
    expect(progress.totalPresets).toBe(5);
    expect(progress.obligatorios).toHaveLength(2);
    expect(progress.completedObligatorios).toBe(0);
  });

  it('completar los CINCO presets → 5/5 y 2/2', () => {
    const progress = progressFrom(
      PRESET_META.map((meta) => makeDoc({ titulo: meta.titulo, estadoIndexacion: 'indexado' })),
    );
    expect(progress.totalPresets).toBe(5);
    expect(progress.completedPresets).toBe(5);
    expect(progress.completedObligatorios).toBe(2);
    expect(progress.missingObligatorios).toHaveLength(0);
  });
});

describe('buildKbGrid — orden de la grilla', () => {
  it('sin documentos devuelve las 5 categorías predefinidas en orden', () => {
    expect(buildKbGrid([]).map((doc) => doc.titulo)).toEqual([...PRESET_ORDER]);
  });

  it('coloca los presets primero y los documentos libres después', () => {
    const titulos = buildKbGrid([
      makeDoc({ titulo: LIBRE }),
      makeDoc({ titulo: OBLIGATORIO_B }),
    ]).map((doc) => doc.titulo);

    expect(titulos.slice(0, 5)).toEqual([...PRESET_ORDER]);
    expect(titulos.slice(5)).toEqual([LIBRE]);
  });

  it('ordena los libres por createdAt ascendente, no por actividad reciente', () => {
    const grid = buildKbGrid([
      makeDoc({ titulo: 'Tercero', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
      makeDoc({ titulo: 'Primero', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }),
      makeDoc({ titulo: 'Segundo', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' }),
    ]);
    expect(grid.slice(5).map((doc) => doc.titulo)).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it('un documento con título de preset no se duplica como libre', () => {
    const grid = buildKbGrid([makeDoc({ titulo: OBLIGATORIO_A })]);
    expect(grid).toHaveLength(5);
    expect(grid.filter((doc) => doc.titulo === OBLIGATORIO_A)).toHaveLength(1);
  });

  it('un preset sin documento real llega como tarjeta virtual vacía', () => {
    const virtual = buildKbGrid([]).find((doc) => doc.titulo === OBLIGATORIO_A);
    expect(virtual?.id.startsWith(VIRTUAL_PRESET_ID_PREFIX)).toBe(true);
    expect(virtual?.contenido).toBe('');
  });
});

describe('computeKbProgress — contador dinámico de documentos indexados', () => {
  it('sin documentos libres el denominador son las 5 categorías', () => {
    expect(progressFrom([]).totalDocumentos).toBe(5);
  });

  it('cada documento libre suma al denominador', () => {
    const progress = progressFrom([
      makeDoc({ titulo: LIBRE, estadoIndexacion: 'pendiente' }),
      makeDoc({ titulo: 'Otro más', estadoIndexacion: 'pendiente' }),
    ]);
    expect(progress.totalDocumentos).toBe(7);
    expect(progress.completedDocumentos).toBe(0);
  });

  it('un documento libre indexado sube Y/Z pero no el contador de obligatorios', () => {
    const progress = progressFrom([makeDoc({ titulo: LIBRE, estadoIndexacion: 'indexado' })]);
    expect(progress.totalDocumentos).toBe(6);
    expect(progress.completedDocumentos).toBe(1);
    expect(progress.completedObligatorios).toBe(0);
    expect(progress.obligatorios).toHaveLength(2);
  });

  it('solo "indexado" cuenta como completado', () => {
    const progress = progressFrom([
      makeDoc({ titulo: OBLIGATORIO_A, estadoIndexacion: 'indexado' }),
      makeDoc({ titulo: OBLIGATORIO_B, estadoIndexacion: 'procesando' }),
      makeDoc({ titulo: LIBRE, estadoIndexacion: 'fallido' }),
    ]);
    expect(progress.totalDocumentos).toBe(6);
    expect(progress.completedDocumentos).toBe(1);
  });
});

describe('isTitleTaken — colisión de títulos al crear', () => {
  const documents = [makeDoc({ titulo: LIBRE })];

  it('un título de categoría predefinida está reservado aunque el preset sea virtual', () => {
    expect(isTitleTaken(OBLIGATORIO_A, [])).toBe(true);
  });

  it('detecta un documento libre ya existente', () => {
    expect(isTitleTaken(LIBRE, documents)).toBe(true);
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(isTitleTaken('  convenios CON empresas  ', documents)).toBe(true);
    expect(isTitleTaken('PRODUCTOS Y SERVICIOS', [])).toBe(true);
  });

  it('un título nuevo queda libre', () => {
    expect(isTitleTaken('Testimonios de egresados', documents)).toBe(false);
  });

  it('un título vacío no se considera ocupado (aún no hay nada que comparar)', () => {
    expect(isTitleTaken('   ', documents)).toBe(false);
  });

  it('normalizeTitulo recorta y baja a minúsculas', () => {
    expect(normalizeTitulo('  Políticas Y Términos ')).toBe('políticas y términos');
  });
});

describe('nextVersion — réplica del isFirstFill del backend', () => {
  it('un preset virtual se creará en v1', () => {
    const virtual = buildKbGrid([]).find((doc) => doc.titulo === OBLIGATORIO_A);
    expect(nextVersion(virtual!)).toBe(1);
  });

  it('el primer contenido de un documento vacío no incrementa la versión', () => {
    expect(nextVersion(makeDoc({ titulo: LIBRE, contenido: '', version: 1 }))).toBe(1);
    expect(nextVersion(makeDoc({ titulo: LIBRE, contenido: '   ', version: 2 }))).toBe(2);
  });

  it('editar un documento con contenido sí incrementa la versión', () => {
    expect(nextVersion(makeDoc({ titulo: LIBRE, contenido: 'algo', version: 3 }))).toBe(4);
  });
});

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
  cardBorder,
  cardStatus,
  computeKbProgress,
  EMPTY_FILTERS,
  esPresetProtegido,
  filterKbGrid,
  hasActiveFilters,
  isTitleTaken,
  mergePresetsWithDocuments,
  nextVersion,
  normalizeContenido,
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
    oculto: false,
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

describe('esPresetProtegido — categorías que la UI no deja eliminar (HU-KB-12)', () => {
  it('«Horarios y ubicación» y «Políticas y términos» están protegidas', () => {
    expect(esPresetProtegido('Horarios y ubicación')).toBe(true);
    expect(esPresetProtegido('Políticas y términos')).toBe(true);
  });

  it('compara normalizado: mayúsculas y espacios sobrantes no la burlan', () => {
    // Es la razón de usar `normalizeTitulo`: el precio de fallar es ofrecer un borrado que no
    // debería existir.
    expect(esPresetProtegido('  HORARIOS Y UBICACIÓN  ')).toBe(true);
    expect(esPresetProtegido('políticas y términos')).toBe(true);
  });

  it('«Información Complementaria» NO está protegida: es la excepción deliberada', () => {
    expect(esPresetProtegido('Información Complementaria')).toBe(false);
  });

  it('los obligatorios no necesitan esta lista: ya los cubre `obligatorio`', () => {
    expect(esPresetProtegido('Información de la empresa')).toBe(false);
    expect(esPresetProtegido('Productos y servicios')).toBe(false);
  });

  it('un título libre del admin nunca está protegido', () => {
    expect(esPresetProtegido('Convenios con empresas')).toBe(false);
  });
});

describe('nextVersion — réplica de las reglas de versionado del backend', () => {
  it('un preset virtual se creará en v1', () => {
    const virtual = buildKbGrid([]).find((doc) => doc.titulo === OBLIGATORIO_A);
    expect(nextVersion(virtual!, 'texto nuevo')).toBe(1);
  });

  it('el primer contenido de un documento vacío no incrementa la versión', () => {
    expect(nextVersion(makeDoc({ titulo: LIBRE, contenido: '', version: 1 }), 'primer texto')).toBe(1);
    expect(nextVersion(makeDoc({ titulo: LIBRE, contenido: '   ', version: 2 }), 'primer texto')).toBe(2);
  });

  it('editar un documento con contenido sí incrementa la versión', () => {
    expect(nextVersion(makeDoc({ titulo: LIBRE, contenido: 'algo', version: 3 }), 'algo distinto')).toBe(4);
  });

  it('guardar el mismo contenido no incrementa la versión (HU-KB-06)', () => {
    const doc = makeDoc({ titulo: LIBRE, contenido: 'texto estable', version: 3 });
    expect(nextVersion(doc, 'texto estable')).toBe(3);
  });

  it('un cambio que es solo whitespace tampoco incrementa la versión (HU-KB-06)', () => {
    const doc = makeDoc({ titulo: LIBRE, contenido: 'hola mundo', version: 3 });
    expect(nextVersion(doc, '  hola\n\n   mundo  ')).toBe(3);
  });

  it('cambiar solo la capitalización SÍ incrementa: la normalización no baja a minúsculas', () => {
    const doc = makeDoc({ titulo: LIBRE, contenido: 'Bogotá', version: 3 });
    expect(nextVersion(doc, 'bogotá')).toBe(4);
  });
});

describe('normalizeContenido', () => {
  it('recorta los extremos y colapsa cualquier racha de whitespace', () => {
    expect(normalizeContenido('  hola\n\n\tmundo   ')).toBe('hola mundo');
  });

  it('no baja a minúsculas ni toca los acentos', () => {
    expect(normalizeContenido('Bogotá')).toBe('Bogotá');
  });
});

describe('cardStatus / cardBorder', () => {
  it('el estado de indexación manda cuando hay algo que indexar', () => {
    expect(cardStatus(makeDoc({ titulo: LIBRE, estadoIndexacion: 'indexado' }))).toBe('indexado');
    expect(cardStatus(makeDoc({ titulo: LIBRE, estadoIndexacion: 'procesando' }))).toBe('procesando');
    expect(cardStatus(makeDoc({ titulo: LIBRE, estadoIndexacion: 'fallido' }))).toBe('fallido');
  });

  it('un documento con contenido en pendiente sigue siendo "pendiente"', () => {
    const doc = makeDoc({ titulo: LIBRE, estadoIndexacion: 'pendiente', contenido: 'algo' });
    expect(cardStatus(doc)).toBe('pendiente');
  });

  it('sin contenido distingue el obligatorio (falta) del opcional', () => {
    const falta = makeDoc({
      titulo: OBLIGATORIO_A,
      estadoIndexacion: 'pendiente',
      contenido: '',
      obligatorio: true,
    });
    const opcional = makeDoc({ titulo: OPCIONAL, estadoIndexacion: 'pendiente', contenido: '' });
    expect(cardStatus(falta)).toBe('falta');
    expect(cardStatus(opcional)).toBe('opcional');
  });

  it('el borde prioriza el obligatorio sin llenar sobre el resto', () => {
    expect(cardBorder('falta')).toContain('amber');
    expect(cardBorder('fallido')).toContain('destructive');
    expect(cardBorder('indexado')).toContain('success');
    expect(cardBorder('opcional')).toBe('border-border');
  });
});

describe('filterKbGrid', () => {
  const grid = buildKbGrid([
    makeDoc({ titulo: OBLIGATORIO_A, estadoIndexacion: 'indexado' }),
    makeDoc({ titulo: OBLIGATORIO_B, estadoIndexacion: 'fallido' }),
    makeDoc({ titulo: OPCIONAL, estadoIndexacion: 'procesando' }),
    makeDoc({ titulo: LIBRE, estadoIndexacion: 'indexado' }),
  ]);

  function titulos(criteria: Parameters<typeof filterKbGrid>[1]): string[] {
    return filterKbGrid(grid, criteria).map((doc) => doc.titulo);
  }

  it('sin criterios devuelve la lista completa', () => {
    expect(filterKbGrid(grid, EMPTY_FILTERS)).toHaveLength(grid.length);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('el texto compara normalizado: ignora mayúsculas y espacios sobrantes', () => {
    expect(titulos({ ...EMPTY_FILTERS, texto: '  PRODUCTOS ' })).toEqual([OBLIGATORIO_B]);
  });

  it('el texto busca por subcadena, no solo por prefijo', () => {
    expect(titulos({ ...EMPTY_FILTERS, texto: 'empresas' })).toEqual([LIBRE]);
  });

  it('filtra por tipo con las mismas etiquetas de las tarjetas', () => {
    expect(titulos({ ...EMPTY_FILTERS, tag: 'requerido' })).toEqual([OBLIGATORIO_A, OBLIGATORIO_B]);
    expect(titulos({ ...EMPTY_FILTERS, tag: 'predefinido' })).toContain(OPCIONAL);
    expect(titulos({ ...EMPTY_FILTERS, tag: 'predefinido' })).not.toContain(LIBRE);
    expect(titulos({ ...EMPTY_FILTERS, tag: 'custom' })).toEqual([LIBRE]);
  });

  it('filtra por estado agrupando procesando y pendiente en "en proceso"', () => {
    expect(titulos({ ...EMPTY_FILTERS, estado: 'indexado' })).toEqual([OBLIGATORIO_A, LIBRE]);
    expect(titulos({ ...EMPTY_FILTERS, estado: 'fallido' })).toEqual([OBLIGATORIO_B]);
    expect(titulos({ ...EMPTY_FILTERS, estado: 'proceso' })).toEqual([OPCIONAL]);
  });

  it('"sin llenar" recoge los presets virtuales, que no tienen documento detrás', () => {
    const sinLlenar = titulos({ ...EMPTY_FILTERS, estado: 'sinLlenar' });
    expect(sinLlenar).toContain('Horarios y ubicación');
    expect(sinLlenar).toContain('Políticas y términos');
  });

  it('los criterios se combinan en AND', () => {
    expect(titulos({ texto: 'información', tag: 'requerido', estado: 'indexado' })).toEqual([
      OBLIGATORIO_A,
    ]);
    expect(titulos({ texto: 'información', tag: 'custom', estado: 'indexado' })).toEqual([]);
  });

  it('hasActiveFilters detecta cualquiera de los tres criterios', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, texto: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, tag: 'custom' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, estado: 'fallido' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, texto: '   ' })).toBe(false);
  });
});

describe('presets ocultos (soft-delete, HU-KB-06)', () => {
  it('un preset oculto desaparece de la grilla y NO vuelve como virtual', () => {
    const grid = buildKbGrid([makeDoc({ titulo: OPCIONAL, oculto: true })]);
    expect(grid.map((doc) => doc.titulo)).not.toContain(OPCIONAL);
    expect(grid).toHaveLength(PRESET_META.length - 1);
  });

  it('baja el denominador de documentos indexados sin tocar el de obligatorios', () => {
    const progress = progressFrom([makeDoc({ titulo: OPCIONAL, oculto: true })]);
    expect(progress.totalDocumentos).toBe(PRESET_META.length - 1);
    expect(progress.obligatorios).toHaveLength(2);
  });

  it('un documento libre oculto tampoco se pinta', () => {
    const grid = buildKbGrid([makeDoc({ titulo: LIBRE, oculto: true })]);
    expect(grid.map((doc) => doc.titulo)).not.toContain(LIBRE);
  });

  it('su título sigue ocupado: el índice único del backend no se liberó', () => {
    const documents = [makeDoc({ titulo: LIBRE, oculto: true })];
    expect(isTitleTaken(LIBRE, documents)).toBe(true);
  });
});

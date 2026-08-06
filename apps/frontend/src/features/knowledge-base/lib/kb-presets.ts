import { Building2, Package, Clock, Scale, HelpCircle, FileText, type LucideIcon } from 'lucide-react';
import type { IKbDocument } from '../types/index.js';

export interface PresetMeta {
  titulo: string;
  proposito: string;
  obligatorio: boolean;
}

/**
 * Espejo liviano de `PRESET_DOCUMENTS` del backend: los 5 presets fijos con su propósito guía y si
 * son obligatorios. Es la fuente de verdad del frontend para renderizar SIEMPRE las 5 tarjetas de la
 * barra, exista o no un documento real por categoría (ver `mergePresetsWithDocuments`).
 */
export const PRESET_META: readonly PresetMeta[] = [
  { titulo: 'Información de la empresa', proposito: 'Nombre, misión, visión', obligatorio: true },
  { titulo: 'Productos y servicios', proposito: 'Catálogo de lo que ofrece', obligatorio: true },
  { titulo: 'Horarios y ubicación', proposito: 'Datos de contacto', obligatorio: false },
  { titulo: 'Políticas y términos', proposito: 'Reglas, garantías, devoluciones', obligatorio: false },
  { titulo: 'Información Complementaria', proposito: 'Texto de referencia adicional que la IA puede consultar', obligatorio: false },
] as const;

/** Orden de prioridad con que se muestran los presets (coincide con el seed del backend). */
export const PRESET_ORDER: readonly string[] = PRESET_META.map((p) => p.titulo);

/**
 * Prefijo del `id` de un preset "virtual": una tarjeta de la barra sin documento real detrás (nunca
 * se creó o fue eliminado). No es un ObjectId de Mongo; el frontend lo usa para decidir crear (POST)
 * en vez de editar (PATCH) cuando el admin lo llena por primera vez.
 */
export const VIRTUAL_PRESET_ID_PREFIX = '__preset_';

/** `true` si el id corresponde a un preset virtual (sin documento real en la DB). */
export function isVirtualPresetId(id: string): boolean {
  return id.startsWith(VIRTUAL_PRESET_ID_PREFIX);
}

/** Ícono por categoría de preset (por título del seed); `FileText` para cualquier otro. */
const PRESET_ICON_BY_TITULO: Record<string, LucideIcon> = {
  'Información de la empresa': Building2,
  'Productos y servicios': Package,
  'Horarios y ubicación': Clock,
  'Políticas y términos': Scale,
  'Información Complementaria': HelpCircle,
};

export function presetIcon(titulo: string): LucideIcon {
  return PRESET_ICON_BY_TITULO[titulo] ?? FileText;
}

/** Un documento "tiene contenido" si su texto crudo no está vacío (aún sin indexar). */
export function hasContent(doc: IKbDocument): boolean {
  return doc.contenido.trim().length > 0;
}

/** Normaliza un título para compararlo: sin espacios sobrantes y sin distinguir mayúsculas. */
export function normalizeTitulo(titulo: string): string {
  return titulo.trim().toLocaleLowerCase('es');
}

/**
 * `true` si el título ya está ocupado por un documento real del tenant o **reservado** por
 * `PRESET_META` (aunque ese preset siga siendo virtual: al llenarlo nacerá con ese mismo título).
 *
 * Comparación normalizada, a propósito **más estricta que el backend**: allí `createDocument` busca
 * con `findOneScoped({ titulo })` —igualdad exacta— y, si encuentra, re-versiona en silencio el
 * documento existente en vez de rechazar. Bloquear aquí las variantes por mayúsculas o espacios
 * evita que el admin fabrique duplicados casi idénticos sin darse cuenta.
 */
export function isTitleTaken(titulo: string, documents: IKbDocument[]): boolean {
  const objetivo = normalizeTitulo(titulo);
  if (objetivo.length === 0) return false;
  return (
    PRESET_META.some((meta) => normalizeTitulo(meta.titulo) === objetivo) ||
    documents.some((doc) => normalizeTitulo(doc.titulo) === objetivo)
  );
}

/**
 * Lista completa que pinta la grilla: los 5 presets fusionados (en el orden fijo de `PRESET_ORDER`)
 * seguidos de los documentos **libres** —los que no corresponden a ninguna categoría predefinida—
 * ordenados por `createdAt` ascendente.
 *
 * El orden es estable a propósito: con `updatedAt` descendente, guardar una tarjeta la haría saltar
 * de posición justo después de tocarla. En una vista que se usa para verificar qué falta, saber
 * dónde está cada cosa vale más que ver primero lo reciente.
 */
export function buildKbGrid(documents: IKbDocument[]): IKbDocument[] {
  const libres = documents
    .filter((doc) => !PRESET_ORDER.includes(doc.titulo))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return [...mergePresetsWithDocuments(documents), ...libres];
}

/**
 * Versión con la que quedará el documento tras "Guardar e indexar". Réplica del `isFirstFill` de
 * `apps/backend/src/features/kb/kb.service.ts`:
 *  - preset virtual → lo crea un POST, que nace en `version: 1`.
 *  - documento real con contenido vacío → primer llenado: el PATCH **no** incrementa la versión.
 *  - documento real con contenido → edición normal: `version + 1`.
 */
export function nextVersion(doc: IKbDocument): number {
  if (isVirtualPresetId(doc.id)) return 1;
  return hasContent(doc) ? doc.version + 1 : doc.version;
}

/**
 * Combina los 5 presets fijos (`PRESET_META`) con los documentos reales del tenant, en el orden fijo.
 * Por cada preset:
 *  - si existe un documento real con ese título → devuelve ese documento, pero **re-imponiendo la
 *    identidad de preset** (`isPreset:true` + `obligatorio`/`proposito` de la meta). Es necesario
 *    porque un preset re-creado vía POST nace `isPreset:false`/`obligatorio:false`, y sin este
 *    sello caería fuera de los conteos por categoría (denominadores 5 y 2 se romperían).
 *  - si no existe (nunca se creó o fue eliminado) → devuelve un documento **virtual** vacío en estado
 *    `pendiente`, con `id` provisional (`__preset_<i>`) que el frontend distingue de un ObjectId real.
 *
 * Garantiza que la barra y el progreso vean SIEMPRE las 5 categorías (2 obligatorias), sin importar
 * cómo se hayan creado los documentos reales.
 */
export function mergePresetsWithDocuments(documents: IKbDocument[]): IKbDocument[] {
  return PRESET_META.map((meta, index) => {
    const real = documents.find((doc) => doc.titulo === meta.titulo);
    if (real) {
      return {
        ...real,
        isPreset: true,
        obligatorio: meta.obligatorio,
        proposito: real.proposito ?? meta.proposito,
      };
    }

    const now = new Date().toISOString();
    return {
      id: `${VIRTUAL_PRESET_ID_PREFIX}${index}`,
      titulo: meta.titulo,
      contenido: '',
      estadoIndexacion: 'pendiente',
      version: 1,
      chunkCount: 0,
      isPreset: true,
      obligatorio: meta.obligatorio,
      proposito: meta.proposito,
      createdAt: now,
      updatedAt: now,
    };
  });
}

/** "Completado" a efectos de la IA = su contenido ya quedó indexado. */
export function isCompleted(doc: IKbDocument): boolean {
  return doc.estadoIndexacion === 'indexado';
}

export interface KbProgress {
  presets: IKbDocument[];
  totalPresets: number;
  completedPresets: number;
  obligatorios: IKbDocument[];
  completedObligatorios: number;
  /** Obligatorios que todavía no tienen contenido (motivan el banner de aviso). */
  missingObligatorios: IKbDocument[];
  /** Toda la grilla: los 5 presets fusionados + los documentos libres del tenant. */
  documentos: IKbDocument[];
  /** Denominador del contador "Y/Z documentos indexados": crece con cada documento libre. */
  totalDocumentos: number;
  /** Numerador del mismo contador: documentos ya indexados, presets y libres por igual. */
  completedDocumentos: number;
}

/**
 * Deriva el estado de progreso a partir de la lista de la grilla (`buildKbGrid`).
 *
 * Dos contadores con contratos distintos y deliberados:
 *  - **Obligatorios (X/2):** denominador fijo. `presets`/`obligatorios` siguen filtrando por
 *    `isPreset`, que es el invariante que arregló HU-KB-01-V3 — un preset re-creado por POST nace
 *    `isPreset:false` y `mergePresetsWithDocuments` le devuelve su identidad por título.
 *  - **Documentos indexados (Y/Z):** denominador dinámico sobre TODA la grilla. Los presets
 *    virtuales cuentan en Z y nunca en Y (nacen `pendiente`), así un tenant nuevo arranca en 0/5 y
 *    pasa a 0/6 en cuanto crea su primer documento propio.
 */
export function computeKbProgress(documents: IKbDocument[]): KbProgress {
  const presets = documents.filter((doc) => doc.isPreset);
  const obligatorios = presets.filter((doc) => doc.obligatorio);

  return {
    presets,
    totalPresets: presets.length,
    completedPresets: presets.filter(isCompleted).length,
    obligatorios,
    completedObligatorios: obligatorios.filter(isCompleted).length,
    missingObligatorios: obligatorios.filter((doc) => !hasContent(doc)),
    documentos: documents,
    totalDocumentos: documents.length,
    completedDocumentos: documents.filter(isCompleted).length,
  };
}

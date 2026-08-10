import { Building2, Package, Clock, Scale, HelpCircle, FileText, type LucideIcon } from 'lucide-react';
import type { EstadoIndexacion, IKbDocument } from '../types/index.js';

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
 * Normaliza el contenido para decidir si un guardado cambia algo: recorta los extremos y colapsa
 * cualquier racha de whitespace a un solo espacio.
 *
 * **Espejo exacto de `normalizeContenido` en `apps/backend/src/features/kb/kb.service.ts`**, que es
 * quien decide de verdad si re-versiona. Aquí solo sirve para anticipar esa decisión en la leyenda
 * del modal. Los dos cambian en lockstep: si divergen, el modal prometería una versión que el
 * backend no va a crear.
 *
 * A propósito NO baja a minúsculas: cambiar "Bogotá" por "bogotá" es un cambio de conocimiento.
 */
export function normalizeContenido(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

/**
 * Estado visual de la tarjeta. Amplía los 4 estados de indexación con los dos que describen a un
 * documento **sin contenido**, donde "Pendiente" no diría nada útil: `falta` (obligatorio vacío) y
 * `opcional` (categoría que aún nadie llenó).
 */
export type CardStatus = EstadoIndexacion | 'falta' | 'opcional';

/** El estado de indexación manda; solo cuando no hay nada que indexar hablamos de falta/opcional. */
export function cardStatus(doc: IKbDocument): CardStatus {
  const estado = doc.estadoIndexacion;
  if (estado === 'indexado' || estado === 'procesando' || estado === 'fallido') return estado;
  if (hasContent(doc)) return 'pendiente';
  return doc.obligatorio ? 'falta' : 'opcional';
}

/** Borde de la tarjeta por prioridad: falta un obligatorio > falló > ya indexado > neutro. */
export function cardBorder(status: CardStatus): string {
  if (status === 'falta') return 'border-amber-400/60 dark:border-amber-500/40';
  if (status === 'fallido') return 'border-destructive/40';
  if (status === 'indexado') return 'border-success/40';
  return 'border-border';
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
    .filter((doc) => !PRESET_ORDER.includes(doc.titulo) && !doc.oculto)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return [...mergePresetsWithDocuments(documents), ...libres];
}

/**
 * Versión con la que quedará el documento tras "Guardar e indexar", conocido el texto tecleado.
 * Réplica de las reglas de `apps/backend/src/features/kb/kb.service.ts`:
 *  - preset virtual → lo crea un POST, que nace en `version: 1`.
 *  - contenido equivalente al guardado → el backend no escribe nada: la versión se queda igual.
 *  - documento real con contenido previo vacío → primer llenado: el PATCH **no** incrementa.
 *  - resto → edición normal: `version + 1`.
 */
export function nextVersion(doc: IKbDocument, contenido: string): number {
  if (isVirtualPresetId(doc.id)) return 1;
  if (normalizeContenido(contenido) === normalizeContenido(doc.contenido)) return doc.version;
  return hasContent(doc) ? doc.version + 1 : doc.version;
}

/**
 * Combina los 5 presets fijos (`PRESET_META`) con los documentos reales del tenant, en el orden fijo.
 * Por cada preset:
 *  - si existe un documento real con ese título → devuelve ese documento, pero **re-imponiendo la
 *    identidad de preset** (`isPreset:true` + `obligatorio`/`proposito` de la meta). Es necesario
 *    porque un preset re-creado vía POST nace `isPreset:false`/`obligatorio:false`, y sin este
 *    sello caería fuera de los conteos por categoría (denominadores 5 y 2 se romperían).
 *  - si el documento real está **oculto** (el admin eliminó esa categoría; soft-delete del backend)
 *    → la categoría desaparece de la lista y **no** se repone como virtual. Sin esto, eliminar un
 *    preset sería un no-op visual: la tarjeta volvería vacía en el siguiente render.
 *  - si no existe (nunca se creó) → devuelve un documento **virtual** vacío en estado `pendiente`,
 *    con `id` provisional (`__preset_<i>`) que el frontend distingue de un ObjectId real.
 *
 * Por eso la lista devuelta tiene longitud **≤ 5**, no siempre 5: `computeKbProgress` deriva de aquí
 * el denominador de "documentos indexados", y una categoría eliminada ya no es algo pendiente de
 * llenar. Los obligatorios no se pueden eliminar (lo valida el backend), así que su denominador
 * fijo de 2 no se mueve.
 */
export function mergePresetsWithDocuments(documents: IKbDocument[]): IKbDocument[] {
  return PRESET_META.flatMap((meta, index) => {
    const real = documents.find((doc) => doc.titulo === meta.titulo);
    if (real?.oculto) return [];
    if (real) {
      return {
        ...real,
        isPreset: true,
        obligatorio: meta.obligatorio,
        proposito: real.proposito ?? meta.proposito,
      };
    }

    const now = new Date().toISOString();
    const virtual: IKbDocument = {
      id: `${VIRTUAL_PRESET_ID_PREFIX}${index}`,
      titulo: meta.titulo,
      contenido: '',
      estadoIndexacion: 'pendiente',
      version: 1,
      chunkCount: 0,
      isPreset: true,
      obligatorio: meta.obligatorio,
      oculto: false,
      proposito: meta.proposito,
      createdAt: now,
      updatedAt: now,
    };
    return virtual;
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

// ─── Filtro de la grilla ────────────────────────────────────────────────────

/** Tipo de conocimiento, con las mismas etiquetas que llevan las tarjetas. */
export type KbTagFilter = 'todos' | 'requerido' | 'predefinido' | 'custom';

/** Estado, agrupando los 6 `CardStatus` en los 4 grupos que el admin distingue de un vistazo. */
export type KbEstadoFilter = 'todos' | 'indexado' | 'proceso' | 'fallido' | 'sinLlenar';

export interface KbFilterCriteria {
  /** Texto ya "debounceado" por el llamador. */
  texto: string;
  tag: KbTagFilter;
  estado: KbEstadoFilter;
}

export const EMPTY_FILTERS: KbFilterCriteria = { texto: '', tag: 'todos', estado: 'todos' };

export function hasActiveFilters(criteria: KbFilterCriteria): boolean {
  return criteria.texto.trim().length > 0 || criteria.tag !== 'todos' || criteria.estado !== 'todos';
}

function matchesTag(doc: IKbDocument, tag: KbTagFilter): boolean {
  switch (tag) {
    case 'requerido':
      return doc.obligatorio;
    case 'predefinido':
      return doc.isPreset && !doc.obligatorio;
    case 'custom':
      return !doc.isPreset && !doc.obligatorio;
    default:
      return true;
  }
}

function matchesEstado(doc: IKbDocument, estado: KbEstadoFilter): boolean {
  const status = cardStatus(doc);
  switch (estado) {
    case 'indexado':
      return status === 'indexado';
    // "En proceso" agrupa `procesando` y `pendiente`. Coincide exactamente con el conjunto que
    // mantiene vivo el refetch de la página: `cardStatus` solo devuelve `pendiente` cuando hay
    // contenido, así que un documento vacío nunca aparece "en proceso" — no hay nada indexándose.
    case 'proceso':
      return status === 'procesando' || status === 'pendiente';
    case 'fallido':
      return status === 'fallido';
    case 'sinLlenar':
      return status === 'falta' || status === 'opcional';
    default:
      return true;
  }
}

/**
 * Filtra la lista **ya fusionada** por `buildKbGrid`. Los tres criterios se combinan en AND.
 *
 * El filtrado es en cliente a propósito: `getKbDocuments` trae hasta 50 documentos de una vez, el
 * endpoint no expone búsqueda ni orden, y la KB de un tenant real es de decenas de entradas. Mover
 * esto al servidor sería complejidad para un problema que todavía no existe.
 */
export function filterKbGrid(documents: IKbDocument[], criteria: KbFilterCriteria): IKbDocument[] {
  const objetivo = normalizeTitulo(criteria.texto);
  return documents.filter(
    (doc) =>
      (objetivo.length === 0 || normalizeTitulo(doc.titulo).includes(objetivo)) &&
      matchesTag(doc, criteria.tag) &&
      matchesEstado(doc, criteria.estado),
  );
}

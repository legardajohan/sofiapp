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

export function presetOrderIndex(titulo: string): number {
  const index = PRESET_ORDER.indexOf(titulo);
  return index === -1 ? PRESET_ORDER.length : index;
}

/** Un documento "tiene contenido" si su texto crudo no está vacío (aún sin indexar). */
export function hasContent(doc: IKbDocument): boolean {
  return doc.contenido.trim().length > 0;
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
  /** Presets ordenados por prioridad de visualización. */
  presetsSorted: IKbDocument[];
  totalPresets: number;
  completedPresets: number;
  obligatorios: IKbDocument[];
  completedObligatorios: number;
  /** Obligatorios que todavía no tienen contenido (motivan el banner de aviso). */
  missingObligatorios: IKbDocument[];
}

/** Deriva todo el estado de progreso de presets a partir de la lista de documentos. */
export function computeKbProgress(documents: IKbDocument[]): KbProgress {
  const presets = documents.filter((doc) => doc.isPreset);
  const presetsSorted = [...presets].sort(
    (a, b) => presetOrderIndex(a.titulo) - presetOrderIndex(b.titulo),
  );
  const obligatorios = presets.filter((doc) => doc.obligatorio);

  return {
    presets,
    presetsSorted,
    totalPresets: presets.length,
    completedPresets: presets.filter(isCompleted).length,
    obligatorios,
    completedObligatorios: obligatorios.filter(isCompleted).length,
    missingObligatorios: obligatorios.filter((doc) => !hasContent(doc)),
  };
}

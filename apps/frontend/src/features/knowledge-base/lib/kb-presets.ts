import { Building2, Package, Clock, Scale, HelpCircle, FileText, type LucideIcon } from 'lucide-react';
import type { IKbDocument } from '../types/index.js';

/** Orden de prioridad con que se muestran los presets (coincide con el seed del backend). */
export const PRESET_ORDER: readonly string[] = [
  'Información de la empresa',
  'Productos y servicios',
  'Horarios y ubicación',
  'Políticas y términos',
  'Preguntas frecuentes',
] as const;

/** Ícono por categoría de preset (por título del seed); `FileText` para cualquier otro. */
const PRESET_ICON_BY_TITULO: Record<string, LucideIcon> = {
  'Información de la empresa': Building2,
  'Productos y servicios': Package,
  'Horarios y ubicación': Clock,
  'Políticas y términos': Scale,
  'Preguntas frecuentes': HelpCircle,
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

import { Search, X } from 'lucide-react';
import { Input } from '../../../components/ui/input.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import type { KbEstadoFilter, KbTagFilter } from '../lib/kb-presets.js';

/**
 * Las etiquetas repiten palabra por palabra las que ya lleva cada tarjeta ("Requerido",
 * "Predefinido", "Indexado", "Fallido", "Sin llenar"): el filtro y la grilla tienen que hablar el
 * mismo idioma o el admin no puede predecir qué va a filtrar.
 *
 * La excepción es "En proceso", que agrupa dos estados de tarjeta —"Procesando" y "Pendiente"—; ahí
 * un nombre paraguas dice más que cualquiera de los dos por separado.
 */
const TAG_LABEL: Record<KbTagFilter, string> = {
  todos: 'Todos los tipos',
  requerido: 'Requerido',
  predefinido: 'Predefinido',
  custom: 'Propio',
};

const ESTADO_LABEL: Record<KbEstadoFilter, string> = {
  todos: 'Todos los estados',
  indexado: 'Indexado',
  proceso: 'En proceso',
  fallido: 'Fallido',
  sinLlenar: 'Sin llenar',
};

interface KnowledgeToolbarProps {
  /** Texto inmediato: controla el input, sin esperar al debounce. */
  texto: string;
  tag: KbTagFilter;
  estado: KbEstadoFilter;
  /** Resultados visibles tras aplicar los filtros; se anuncia por `aria-live`. */
  resultCount: number;
  hasFilters: boolean;
  onTextoChange: (value: string) => void;
  onTagChange: (value: KbTagFilter) => void;
  onEstadoChange: (value: KbEstadoFilter) => void;
}

/**
 * Controles de búsqueda y filtrado de la grilla. Es *chrome*: se mantiene deliberadamente callado
 * —sin color propio ni chips— para no competir con la tarjeta `bg-primary`, que es el único elemento
 * enfático de la vista.
 */
export function KnowledgeToolbar({
  texto,
  tag,
  estado,
  resultCount,
  hasFilters,
  onTextoChange,
  onTagChange,
  onEstadoChange,
}: KnowledgeToolbarProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={texto}
          onChange={(e) => onTextoChange(e.target.value)}
          placeholder="Buscar conocimiento…"
          aria-label="Buscar conocimiento por nombre"
          className="pl-9 pr-9"
        />
        {texto.length > 0 && (
          <button
            type="button"
            onClick={() => onTextoChange('')}
            aria-label="Borrar la búsqueda"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <Select value={tag} onValueChange={(v) => onTagChange(v as KbTagFilter)}>
        <SelectTrigger aria-label="Filtrar por tipo" className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TAG_LABEL) as KbTagFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {TAG_LABEL[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={estado} onValueChange={(v) => onEstadoChange(v as KbEstadoFilter)}>
        <SelectTrigger aria-label="Filtrar por estado" className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ESTADO_LABEL) as KbEstadoFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {ESTADO_LABEL[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* El filtrado es instantáneo y silencioso: sin esto, un lector de pantalla no se entera. */}
      <p aria-live="polite" className="sr-only">
        {hasFilters
          ? `${resultCount} ${resultCount === 1 ? 'resultado' : 'resultados'}`
          : 'Sin filtros aplicados'}
      </p>
    </div>
  );
}

import { Plus } from 'lucide-react';
import type { EstadoIndexacion, IKbDocument } from '../types/index.js';

// Orden de prioridad con que se muestran los presets (coincide con el seed del backend).
const PRESET_ORDER: readonly string[] = [
  'Información de la empresa',
  'Productos y servicios',
  'Horarios y ubicación',
  'Políticas y términos',
  'Preguntas frecuentes',
] as const;

// Los dos primeros se marcan como "Requerido" (guía visual, sin lógica de bloqueo).
const REQUIRED_PRESETS: readonly string[] = PRESET_ORDER.slice(0, 2);

// Color del punto según el estado de indexación (misma paleta que IndexingStatusBadge).
const DOT_BY_ESTADO: Record<EstadoIndexacion, string> = {
  pendiente: 'bg-gray-400',
  procesando: 'bg-amber-500 animate-pulse',
  indexado: 'bg-success',
  fallido: 'bg-destructive',
};

function presetOrderIndex(titulo: string): number {
  const index = PRESET_ORDER.indexOf(titulo);
  return index === -1 ? PRESET_ORDER.length : index;
}

interface PresetKnowledgeBarProps {
  documents: IKbDocument[];
  editingDocumentId?: string | null;
  onEdit: (doc: IKbDocument) => void;
  onCreateNew: () => void;
}

export function PresetKnowledgeBar({
  documents,
  editingDocumentId,
  onEdit,
  onCreateNew,
}: PresetKnowledgeBarProps): React.ReactElement | null {
  const presets = documents
    .filter((doc) => doc.isPreset)
    .sort((a, b) => presetOrderIndex(a.titulo) - presetOrderIndex(b.titulo));

  if (presets.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((doc) => {
        const active = editingDocumentId === doc.id;
        const required = REQUIRED_PRESETS.includes(doc.titulo);
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => onEdit(doc)}
            aria-label={`Editar ${doc.titulo}`}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border bg-card hover:bg-muted cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 ${
              active ? 'ring-2 ring-primary/40' : ''
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_BY_ESTADO[doc.estadoIndexacion]}`}
            />
            {doc.titulo}
            {required && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Requerido
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onCreateNew}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-muted-foreground/40 bg-transparent hover:bg-muted cursor-pointer transition-colors text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <Plus className="w-3.5 h-3.5" />
        Agregar nuevo conocimiento
      </button>
    </div>
  );
}

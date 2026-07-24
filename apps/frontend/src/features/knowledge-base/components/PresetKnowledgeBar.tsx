import { Plus, Check } from 'lucide-react';
import type { EstadoIndexacion, IKbDocument } from '../types/index.js';
import { presetIcon, hasContent, mergePresetsWithDocuments } from '../lib/kb-presets.js';

interface PresetKnowledgeBarProps {
  documents: IKbDocument[];
  editingDocumentId?: string | null;
  onEdit: (doc: IKbDocument) => void;
  onCreateNew: () => void;
}

/** Estado visual derivado de la indexación + si el preset obligatorio está sin llenar. */
type PresetStatus = 'indexado' | 'procesando' | 'fallido' | 'falta' | 'pendiente' | 'opcional';

function presetStatus(doc: IKbDocument): PresetStatus {
  const estado: EstadoIndexacion = doc.estadoIndexacion;
  if (estado === 'indexado') return 'indexado';
  if (estado === 'procesando') return 'procesando';
  if (estado === 'fallido') return 'fallido';
  if (doc.obligatorio && !hasContent(doc)) return 'falta';
  if (hasContent(doc)) return 'pendiente';
  return 'opcional';
}

const STATUS_META: Record<PresetStatus, { label: string; dot: string; text: string }> = {
  indexado: { label: 'Indexado', dot: 'bg-success', text: 'text-success' },
  procesando: { label: 'Procesando…', dot: 'bg-amber-500 animate-pulse', text: 'text-amber-600' },
  fallido: { label: 'Error al indexar', dot: 'bg-destructive', text: 'text-destructive' },
  falta: { label: 'Requerido · falta', dot: 'bg-amber-500', text: 'text-amber-600' },
  pendiente: { label: 'Pendiente', dot: 'bg-gray-400', text: 'text-muted-foreground' },
  opcional: { label: 'Opcional', dot: 'bg-gray-300', text: 'text-muted-foreground' },
};

/** Borde/anillo de la card según prioridad: activo > falta obligatorio > indexado > neutro. */
function cardBorder(status: PresetStatus, active: boolean): string {
  if (active) return 'border-primary/50 ring-2 ring-primary/30';
  if (status === 'falta') return 'border-amber-400/60';
  if (status === 'fallido') return 'border-destructive/40';
  if (status === 'indexado') return 'border-success/40';
  return 'border-border';
}

export function PresetKnowledgeBar({
  documents,
  editingDocumentId,
  onEdit,
  onCreateNew,
}: PresetKnowledgeBarProps): React.ReactElement {
  // Siempre las 5 categorías: los presets sin documento real se muestran como tarjetas virtuales
  // vacías (estado "opcional"/"falta"), para que eliminar un documento no borre su tarjeta.
  const presets = mergePresetsWithDocuments(documents);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {presets.map((doc) => {
        const active = editingDocumentId === doc.id;
        const status = presetStatus(doc);
        const meta = STATUS_META[status];
        const Icon = presetIcon(doc.titulo);
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => onEdit(doc)}
            aria-label={`Editar ${doc.titulo}`}
            aria-pressed={active}
            className={`group relative flex items-start gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40 ${cardBorder(status, active)}`}
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-secondary-foreground group-hover:bg-card">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">{doc.titulo}</span>
                {doc.obligatorio && (
                  <span className="flex-shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Requerido
                  </span>
                )}
              </span>
              <span className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            </span>
            {status === 'indexado' && (
              <span
                key={doc.estadoIndexacion}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success text-success-foreground animate-in zoom-in-50 duration-300"
              >
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onCreateNew}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/40 bg-transparent p-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <Plus className="h-4 w-4" />
        Agregar nuevo conocimiento
      </button>
    </div>
  );
}

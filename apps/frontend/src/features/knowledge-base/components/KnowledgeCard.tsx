import { hasContent, isVirtualPresetId, presetIcon } from '../lib/kb-presets.js';
import type { EstadoIndexacion, IKbDocument } from '../types/index.js';
import { IndexingStatusBadge } from './IndexingStatusBadge.js';

/**
 * Estado visual de la tarjeta. Amplía los 4 estados de indexación con los dos que describen a un
 * documento **sin contenido**, donde "Pendiente" no diría nada útil: `falta` (obligatorio vacío) y
 * `opcional` (categoría que aún nadie llenó).
 */
type CardStatus = EstadoIndexacion | 'falta' | 'opcional';

/** El estado de indexación manda; solo cuando no hay nada que indexar hablamos de falta/opcional. */
function cardStatus(doc: IKbDocument): CardStatus {
  const estado = doc.estadoIndexacion;
  if (estado === 'indexado' || estado === 'procesando' || estado === 'fallido') return estado;
  if (hasContent(doc)) return 'pendiente';
  return doc.obligatorio ? 'falta' : 'opcional';
}

/** Borde de la tarjeta por prioridad: falta un obligatorio > falló > ya indexado > neutro. */
function cardBorder(status: CardStatus): string {
  if (status === 'falta') return 'border-amber-400/60 dark:border-amber-500/40';
  if (status === 'fallido') return 'border-destructive/40';
  if (status === 'indexado') return 'border-success/40';
  return 'border-border';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fragmentos(chunkCount: number): string {
  return `${chunkCount} ${chunkCount === 1 ? 'fragmento' : 'fragmentos'}`;
}

interface KnowledgeCardProps {
  /** Documento real del tenant o preset virtual (`__preset_*`) todavía sin crear. */
  doc: IKbDocument;
  onOpen: (doc: IKbDocument) => void;
}

/**
 * Tarjeta única de la grilla: sirve igual a un preset predefinido, a un preset virtual y a un
 * documento creado por el admin. Reúne lo que antes estaba repartido entre la barra de presets
 * (identidad y estado) y la tabla inferior (versión, fragmentos y fecha).
 */
export function KnowledgeCard({ doc, onOpen }: KnowledgeCardProps): React.ReactElement {
  const status = cardStatus(doc);
  const Icon = presetIcon(doc.titulo);
  // Un preset virtual no existe en la base: su versión, sus fragmentos y su fecha los fabrica el
  // merge en cada render. Mostrarlos como si fueran datos reales sería mentir sobre su estado.
  const esVirtual = isVirtualPresetId(doc.id);

  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      aria-label={`${hasContent(doc) ? 'Editar' : 'Completar'} ${doc.titulo}`}
      className={`group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40 ${cardBorder(status)}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-secondary-foreground transition-colors group-hover:bg-card">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Sin `truncate`: el ancho de 2 columnas existe justamente para no cortar títulos. */}
            <span className="break-words text-sm font-medium text-foreground">{doc.titulo}</span>
            {doc.obligatorio && (
              <span className="flex-shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Requerido
              </span>
            )}
            {doc.isPreset && !doc.obligatorio && (
              <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Predefinido
              </span>
            )}
          </div>

          {status === 'falta' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Falta completarlo
            </span>
          ) : status === 'opcional' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              Sin llenar
            </span>
          ) : (
            <IndexingStatusBadge estado={doc.estadoIndexacion} />
          )}
        </div>
      </div>

      {doc.estadoIndexacion === 'fallido' && doc.error && (
        <p className="text-xs text-destructive">{doc.error}</p>
      )}

      <p className="mt-auto text-xs tabular-nums text-muted-foreground">
        {esVirtual
          ? 'Sin contenido todavía'
          : `v${doc.version} · ${fragmentos(doc.chunkCount)} · Actualizado ${formatDate(doc.updatedAt)}`}
      </p>
    </button>
  );
}

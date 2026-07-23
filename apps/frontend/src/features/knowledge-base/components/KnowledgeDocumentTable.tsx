import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { deleteKbDocument } from '../../../api/knowledge-base.js';
import type { IKbDocument } from '../types/index.js';
import { IndexingStatusBadge } from './IndexingStatusBadge.js';
import { KnowledgeEmptyState } from './KnowledgeEmptyState.js';

interface KnowledgeDocumentTableProps {
  /** Documentos ya cargados por el padre (query única compartida con la barra de presets). */
  documents: IKbDocument[];
  isLoading: boolean;
  isError: boolean;
  /** Reintenta la carga cuando la query falló. */
  onRetry: () => void;
  /** Se dispara al pulsar el lápiz de una fila para editar ese documento. */
  onEdit: (doc: IKbDocument) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function KnowledgeDocumentTable({
  documents,
  isLoading,
  isError,
  onRetry,
  onEdit,
}: KnowledgeDocumentTableProps): React.ReactElement {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: deleteKbDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'documents'] });
      toast.success('Documento eliminado.');
    },
    onError: () => {
      toast.error('No se pudo eliminar el documento. Intenta de nuevo.');
    },
  });

  // Solo la fila en borrado se deshabilita/carga, no toda la tabla.
  const deletingId = deleteMutation.isPending ? deleteMutation.variables : null;

  function handleDelete(id: string): void {
    if (
      window.confirm(
        '¿Eliminar este documento? Se borrarán todos sus fragmentos y no se podrá recuperar.',
      )
    ) {
      deleteMutation.mutate(id);
    }
  }

  const documentos = documents;

  return (
    <div className="bg-card border border-border rounded-xl shadow-card">
      <div className="px-6 py-5 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Conocimiento cargado</h2>
        {!isLoading && !isError && (
          <span className="text-xs text-muted-foreground">
            {documentos.length} {documentos.length === 1 ? 'documento' : 'documentos'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3 px-6 py-5" aria-busy="true" aria-label="Cargando documentos">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="px-6 py-10 text-center text-sm text-destructive">
          <p>No se pudo cargar la lista de documentos.</p>
          <button onClick={onRetry} className="mt-2 text-xs underline">
            Reintentar
          </button>
        </div>
      ) : documentos.length === 0 ? (
        <KnowledgeEmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-6 py-3 font-medium">Título</th>
                <th className="px-4 py-3 font-medium">Versión</th>
                <th className="px-4 py-3 font-medium">Fragmentos</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Actualizado</th>
                <th className="px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((doc) => (
                <tr key={doc.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 text-foreground font-medium">
                    <span className="inline-flex items-center gap-2">
                      {doc.titulo}
                      {doc.isPreset && (
                        <Badge variant="secondary" className="font-normal">
                          Predefinido
                        </Badge>
                      )}
                    </span>
                    {doc.estadoIndexacion === 'fallido' && doc.error && (
                      <p className="text-xs text-destructive font-normal mt-0.5">{doc.error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary-foreground">v{doc.version}</td>
                  <td className="px-4 py-3 text-secondary-foreground">{doc.chunkCount}</td>
                  <td className="px-4 py-3">
                    <IndexingStatusBadge estado={doc.estadoIndexacion} />
                  </td>
                  <td className="px-6 py-3 text-secondary-foreground">{formatDate(doc.updatedAt)}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(doc)}
                        disabled={deletingId === doc.id}
                        aria-label={`Editar ${doc.titulo}`}
                        title="Editar"
                        className="p-1.5 rounded-md text-secondary-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                        aria-label={`Eliminar ${doc.titulo}`}
                        title="Eliminar"
                        className="p-1.5 rounded-md text-secondary-foreground hover:text-destructive hover:bg-destructive-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { getKbDocuments } from '../../../api/knowledge-base.js';
import type { IKbDocument, KbDocumentsListResponse } from '../types/index.js';
import { IndexingStatusBadge } from './IndexingStatusBadge.js';

function isPending(doc: IKbDocument): boolean {
  return doc.estadoIndexacion === 'pendiente' || doc.estadoIndexacion === 'procesando';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function KnowledgeDocumentTable(): React.ReactElement {
  const { data, isLoading, isError } = useQuery<KbDocumentsListResponse>({
    queryKey: ['kb', 'documents'],
    queryFn: () => getKbDocuments({ page: 1, limit: 50 }),
    // Refresca mientras haya documentos indexándose, para ver el estado en vivo.
    refetchInterval: (query) =>
      query.state.data?.data.some(isPending) ? 3000 : false,
  });

  const documentos = data?.data ?? [];

  return (
    <div className="bg-card border border-border rounded-xl shadow-card">
      <div className="px-6 py-5 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Conocimiento cargado</h2>
        {data && (
          <span className="text-xs text-muted-foreground">
            {data.total} {data.total === 1 ? 'documento' : 'documentos'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : isError ? (
        <div className="px-6 py-10 text-center text-sm text-destructive">
          No se pudo cargar la lista de documentos.
        </div>
      ) : documentos.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">
          Aún no has cargado conocimiento. Usa el editor de arriba para empezar.
        </div>
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
              </tr>
            </thead>
            <tbody>
              {documentos.map((doc) => (
                <tr key={doc.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 text-foreground font-medium">
                    {doc.titulo}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

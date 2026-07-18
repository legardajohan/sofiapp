import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getKbDocuments } from '../../../api/knowledge-base.js';
import { KnowledgeUploadEditor } from '../components/KnowledgeUploadEditor.js';
import { KnowledgeDocumentTable } from '../components/KnowledgeDocumentTable.js';
import { PresetKnowledgeBar } from '../components/PresetKnowledgeBar.js';
import type { IKbDocument, KbDocumentsListResponse } from '../types/index.js';

// Indica si un documento está indexándose activamente (justifica el polling en vivo). Un `pendiente`
// SIN contenido es un preset en reposo, no un trabajo en curso: no debe mantener el polling vivo.
function isIndexingActive(doc: IKbDocument): boolean {
  if (doc.estadoIndexacion === 'procesando') return true;
  return doc.estadoIndexacion === 'pendiente' && doc.contenido.trim().length > 0;
}

export function KnowledgeBasePage(): React.ReactElement {
  const [editingDocument, setEditingDocument] = useState<IKbDocument | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Query única compartida por la barra de presets y la tabla (evita doble fetch).
  const { data, isLoading, isError, refetch } = useQuery<KbDocumentsListResponse>({
    queryKey: ['kb', 'documents'],
    queryFn: () => getKbDocuments({ page: 1, limit: 50 }),
    // Refresca solo mientras haya documentos indexándose de verdad (no presets vacíos en reposo).
    refetchInterval: (query) => (query.state.data?.data.some(isIndexingActive) ? 3000 : false),
  });

  const documents = data?.data ?? [];

  // Al iniciar una edición, lleva el formulario a la vista para que el admin no lo pierda de vista.
  useEffect(() => {
    if (!editingDocument) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    formRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [editingDocument]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">
              Entrenar la IA
            </h1>
            <p className="text-sm text-secondary-foreground mt-0.5">
              Carga la información pertinente que la IA usará como contexto al responder.
            </p>
          </div>
        </div>

        <PresetKnowledgeBar
          documents={documents}
          editingDocumentId={editingDocument?.id}
          onEdit={(doc) => setEditingDocument(doc)}
          onCreateNew={() => setEditingDocument(null)}
        />

        <div ref={formRef}>
          <KnowledgeUploadEditor
            document={editingDocument ?? undefined}
            onDone={() => setEditingDocument(null)}
          />
        </div>
        <KnowledgeDocumentTable
          documents={documents}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          onEdit={(doc) => setEditingDocument(doc)}
        />
      </div>
    </div>
  );
}

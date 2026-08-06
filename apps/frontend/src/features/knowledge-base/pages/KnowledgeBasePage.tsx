import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle } from 'lucide-react';
import { getKbDocuments } from '../../../api/knowledge-base.js';
import { KnowledgeGrid } from '../components/KnowledgeGrid.js';
import {
  KnowledgeDocumentDialog,
  type KbDialogTarget,
} from '../components/KnowledgeDocumentDialog.js';
import { PresetProgress } from '../components/PresetProgress.js';
import { RequiredPresetsBanner } from '../components/RequiredPresetsBanner.js';
import { KnowledgeOnboardingDialog } from '../components/KnowledgeOnboardingDialog.js';
import { buildKbGrid, computeKbProgress } from '../lib/kb-presets.js';
import type { IKbDocument, KbDocumentsListResponse } from '../types/index.js';

const ONBOARDING_KEY = 'kb_onboarding_dismissed';

// Indica si un documento está indexándose activamente (justifica el polling en vivo). Un `pendiente`
// SIN contenido es un preset en reposo, no un trabajo en curso: no debe mantener el polling vivo.
function isIndexingActive(doc: IKbDocument): boolean {
  if (doc.estadoIndexacion === 'procesando') return true;
  return doc.estadoIndexacion === 'pendiente' && doc.contenido.trim().length > 0;
}

export function KnowledgeBasePage(): React.ReactElement {
  const [dialogTarget, setDialogTarget] = useState<KbDialogTarget | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== '1',
  );

  const { data, isLoading, isError, refetch } = useQuery<KbDocumentsListResponse>({
    queryKey: ['kb', 'documents'],
    queryFn: () => getKbDocuments({ page: 1, limit: 50 }),
    // Refresca solo mientras haya documentos indexándose de verdad (no presets vacíos en reposo).
    refetchInterval: (query) => (query.state.data?.data.some(isIndexingActive) ? 3000 : false),
  });

  // Documentos crudos del API (fuente de verdad para detectar títulos ya usados) y la lista de la
  // grilla: las 5 categorías siempre presentes + los documentos propios del tenant.
  const documents = data?.data ?? [];
  const gridDocuments = buildKbGrid(documents);
  const progress = computeKbProgress(gridDocuments);

  function handleOnboardingChange(open: boolean): void {
    setOnboardingOpen(open);
    if (!open) localStorage.setItem(ONBOARDING_KEY, '1');
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <KnowledgeOnboardingDialog open={onboardingOpen} onOpenChange={handleOnboardingChange} />

      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary">
            <svg className="h-5 w-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Entrenar la IA</h1>
            <p className="mt-0.5 text-sm text-secondary-foreground">
              Carga la información pertinente que la IA usará como contexto al responder.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            aria-label="Ver la guía de la base de conocimiento"
            title="¿Cómo funciona?"
            className="flex-shrink-0 rounded-md p-1.5 text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>

        <PresetProgress progress={progress} />

        <RequiredPresetsBanner
          missing={progress.missingObligatorios}
          onFix={(doc) => setDialogTarget({ mode: 'edit', doc })}
        />

        {/* Una sola grilla: las 5 categorías predefinidas (las que no existen llegan como preset
            virtual `__preset_*`, que el editor detecta para crear en vez de editar) seguidas de los
            documentos propios del tenant. */}
        <KnowledgeGrid
          documents={gridDocuments}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          onOpen={(doc) => setDialogTarget({ mode: 'edit', doc })}
          onCreate={() => setDialogTarget({ mode: 'create' })}
        />

        <KnowledgeDocumentDialog
          target={dialogTarget}
          documents={documents}
          onOpenChange={(open) => {
            if (!open) setDialogTarget(null);
          }}
        />
      </div>
    </div>
  );
}

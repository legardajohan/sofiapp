import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { AiResponseTable } from '../components/AiResponseTable.js';
import { AiResponseContextSheet } from '../components/AiResponseContextSheet.js';
import type { AiUsageMethod } from '../types.js';

export function AiContextPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState<AiUsageMethod | undefined>(undefined);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
          <ScanSearch className="size-5 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Fuentes y contexto
          </h1>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Audita qué prompt y qué conocimiento de la base sustentaron cada respuesta de la IA.
          </p>
        </div>
      </header>

      <AiResponseTable
        page={page}
        onPageChange={setPage}
        method={method}
        onMethodChange={setMethod}
      />

      <AiResponseContextSheet />
    </div>
  );
}

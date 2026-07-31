import { useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { FaqFormDialog } from '../components/FaqFormDialog.js';
import { FaqTable } from '../components/FaqTable.js';
import { FaqTester } from '../components/FaqTester.js';
import type { IKbFaq } from '../types/index.js';

export function KnowledgeFaqsPage(): React.ReactElement {
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [enEdicion, setEnEdicion] = useState<IKbFaq | undefined>(undefined);

  function abrirCrear(): void {
    setEnEdicion(undefined);
    setDialogAbierto(true);
  }

  function abrirEditar(faq: IKbFaq): void {
    setEnEdicion(faq);
    setDialogAbierto(true);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
          <MessageCircleQuestion
            className="size-5 text-primary-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Preguntas frecuentes
          </h1>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Respuestas exactas para lo que más te preguntan. Sofi las entrega tal cual, al
            instante y sin gastar tokens del modelo.
          </p>
        </div>
      </header>

      <FaqTester />

      <FaqTable onEdit={abrirEditar} onCreate={abrirCrear} />

      <FaqFormDialog faq={enEdicion} open={dialogAbierto} onOpenChange={setDialogAbierto} />
    </div>
  );
}

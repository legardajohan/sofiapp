import { useState } from 'react';
import { MessageCircleQuestion, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaqFormDialog } from '../components/FaqFormDialog.js';
import { FaqTable } from '../components/FaqTable.js';
import { FaqTester } from '../components/FaqTester.js';
import { estadoMinimo, useKbFaqs } from '../hooks/useKbFaqs.js';
import type { IKbFaq } from '../types/index.js';

export function KnowledgeFaqsPage(): React.ReactElement {
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [enEdicion, setEnEdicion] = useState<IKbFaq | undefined>(undefined);
  const { data } = useKbFaqs();
  const { faltan, cumple } = estadoMinimo(data);

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

      {data && !cumple && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-border bg-muted/50 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {faltan === 1
                ? 'Te falta 1 pregunta frecuente'
                : `Te faltan ${faltan} preguntas frecuentes`}
            </p>
            <p className="mt-0.5 max-w-prose text-sm text-secondary-foreground">
              Sofi entrega al instante, y sin gastar tokens, las que tenga activas. Cuando cubras
              las que más te repiten, esas consultas dejan de pasar por el modelo.
            </p>
          </div>
          <Button size="sm" onClick={abrirCrear}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva pregunta
          </Button>
        </div>
      )}

      <FaqTester />

      <FaqTable onEdit={abrirEditar} onCreate={abrirCrear} />

      <FaqFormDialog faq={enEdicion} open={dialogAbierto} onOpenChange={setDialogAbierto} />
    </div>
  );
}

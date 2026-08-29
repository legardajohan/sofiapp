import { useState } from 'react';
import { FileStack } from 'lucide-react';
import { CreateTemplateDialog } from '../components/CreateTemplateDialog.js';
import { TemplateList } from '../components/TemplateList.js';

export function TemplatesPage(): React.ReactElement {
  const [dialogAbierto, setDialogAbierto] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
          <FileStack className="size-5 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Plantillas de WhatsApp
          </h1>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            El catálogo aprobado por Meta para escribirle a un cliente fuera de la ventana de
            24 h.
          </p>
        </div>
      </header>

      <TemplateList onCreate={() => setDialogAbierto(true)} />

      <CreateTemplateDialog open={dialogAbierto} onOpenChange={setDialogAbierto} />
    </div>
  );
}

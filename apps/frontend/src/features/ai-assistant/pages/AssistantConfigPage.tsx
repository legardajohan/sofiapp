import { Bot, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AssistantConfigForm } from '../components/AssistantConfigForm.js';
import { useAssistantConfig } from '../hooks/useAssistantConfig.js';

function CargandoConfiguracion(): React.ReactElement {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando la configuración del asistente">
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

/** Aviso de que la empresa aún usa la configuración de fábrica. */
function AvisoHeredado(): React.ReactElement {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
      <Info className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
      <p className="text-sm text-secondary-foreground">
        Estás usando la configuración por defecto. Al guardar se crea la de tu empresa, y a partir
        de ahí solo cambia cuando la cambies tú.
      </p>
    </div>
  );
}

export function AssistantConfigPage(): React.ReactElement {
  const { data: config, isPending, isError, refetch } = useAssistantConfig();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
          <Bot className="size-5 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Asistente IA</h1>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Define cómo responde Sofi en WhatsApp. Lo que dice sale de tu base de conocimiento;
            aquí decides con qué voz y con qué límites.
          </p>
        </div>
      </header>

      {isPending && <CargandoConfiguracion />}

      {isError && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-foreground">
            No se pudo cargar la configuración del asistente.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Reintentar
          </button>
        </div>
      )}

      {config && (
        <>
          {config.heredado && <AvisoHeredado />}
          <AssistantConfigForm config={config} />
        </>
      )}
    </div>
  );
}

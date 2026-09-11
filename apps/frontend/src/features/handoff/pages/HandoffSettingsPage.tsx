import { ArrowRightLeft, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { HandoffSettingsForm } from '../components/HandoffSettingsForm.js';
import { useHandoffSettings } from '../hooks/useHandoffSettings.js';

function CargandoConfiguracion(): React.ReactElement {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando la configuración de transferencia">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

/** Aviso de que la empresa aún no ha configurado nada y la transferencia está apagada. */
function AvisoSinConfigurar(): React.ReactElement {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
      <Info className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
      <p className="text-sm text-secondary-foreground">
        Todavía no has configurado la transferencia, así que Sofi responde siempre. Enciéndela y
        elige al menos una condición para que empiece a pasarle conversaciones a tu equipo.
      </p>
    </div>
  );
}

export function HandoffSettingsPage(): React.ReactElement {
  const { data: settings, isPending, isError, refetch } = useHandoffSettings();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
          <ArrowRightLeft className="size-5 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Transferencia a un asesor
          </h1>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Decide cuándo Sofi deja de responder y le pasa la conversación a una persona. Después
            de transferir, el bot queda callado en ese hilo hasta que alguien lo reactive.
          </p>
        </div>
      </header>

      {isPending && <CargandoConfiguracion />}

      {isError && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-foreground">
            No se pudo cargar la configuración de transferencia.
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

      {settings && (
        <>
          {settings.heredado && <AvisoSinConfigurar />}
          <HandoffSettingsForm settings={settings} />
        </>
      )}
    </div>
  );
}

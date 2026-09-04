import { Link } from 'react-router-dom';
import { Info, Plus, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFlows } from '../hooks/useFlows.js';
import { ReminderSettings } from '../components/ReminderSettings.js';

const ESTADO_LABEL: Record<string, string> = { borrador: 'Borrador', publicado: 'Publicado' };

export function FlowsPage(): React.ReactElement {
  const { data, isLoading, isError, refetch } = useFlows();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold text-foreground">Flujos</h1>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Por qué solo hay un flujo activo"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  Solo un flujo puede estar activo por empresa. Para manejar varios temas —
                  horarios, precios, ventas— agrega un nodo de Intención al inicio que los enrute
                  a cada uno dentro del mismo flujo.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Automatiza las conversaciones de WhatsApp con ramas según lo que responde el cliente.
          </p>
        </div>
        <Button asChild>
          <Link to="/flows/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo flujo
          </Link>
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive-subtle p-6 text-center">
          <p className="text-sm text-destructive">No se pudieron cargar los flujos.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {data.map((flow) => (
            <li key={flow.id}>
              <Link
                to={`/flows/${flow.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{flow.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {ESTADO_LABEL[flow.estado] ?? flow.estado} · v{flow.version}
                  </p>
                </div>
                {flow.activo ? (
                  <Badge variant="success" className="shrink-0">
                    Activo
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Workflow className="h-6 w-6" />
          </div>
          <div className="max-w-sm space-y-1">
            <h3 className="text-sm font-medium text-foreground">Todavía no hay flujos</h3>
            <p className="text-sm text-muted-foreground">
              Crea el primero para que la conversación avance sola según lo que responde el cliente.
            </p>
          </div>
          <Button asChild>
            <Link to="/flows/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo flujo
            </Link>
          </Button>
        </div>
      )}

      <ReminderSettings />
    </div>
  );
}

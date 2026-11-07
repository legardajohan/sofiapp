import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TagChip } from '@/features/tags/components/TagChip';
import { ETIQUETA_DESTINATARIO } from '@/features/campaigns/lib/pacing';
import { useLead } from '../hooks/useLead.js';
import { fechaLarga } from '../lib/format.js';
import type { LeadCampanaDTO } from '../types.js';

interface Props {
  leadId: string;
}

/** «Entregado el 1 de noviembre…», o solo el estado si el envío no llegó a salir. */
function comoLeLlego(c: LeadCampanaDTO): string {
  const estado = ETIQUETA_DESTINATARIO[c.estado];
  return c.enviadoAt ? `${estado} el ${fechaLarga(c.enviadoAt)}` : estado;
}

/**
 * Campañas que recibió el contacto del lead (HU-MARK-07): la otra mitad de la trazabilidad. La
 * etiqueta dice «este contacto vino de una campaña»; esta lista dice de cuál, cuándo y si le llegó.
 *
 * Lee la ficha completa (`GET /api/leads/:id`) y no el listado: el historial de campañas solo se
 * pide al abrir un lead, nunca para toda la tabla.
 */
export function LeadCampanas({ leadId }: Props): React.ReactElement {
  const { data, isLoading, isError } = useLead(leadId);
  const campanas = data?.campanas ?? [];

  return (
    <section className="mt-6" aria-labelledby="lead-campanas">
      <h3 id="lead-campanas" className="text-sm font-semibold text-foreground">
        Campañas recibidas
      </h3>

      {isLoading ? (
        <div className="mt-2 space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          No se pudieron cargar las campañas de este lead.
        </p>
      ) : campanas.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no ha recibido campañas.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {campanas.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/campanas/${c.id}`}
                  className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {c.nombre}
                </Link>
                <p
                  className={cn(
                    'mt-0.5 text-xs',
                    c.estado === 'fallido' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {comoLeLlego(c)}
                </p>
              </div>
              {c.etiqueta ? (
                <TagChip
                  tag={{ ...c.etiqueta, semaforo: null }}
                  className="mt-0.5 max-w-36 shrink-0"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

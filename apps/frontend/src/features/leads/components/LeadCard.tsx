import { useState } from 'react';
import { AlertCircle, MoreHorizontal, Target, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteLead } from '../hooks/useDeleteLead.js';
import { DeleteLeadDialog } from './DeleteLeadDialog.js';
import type { LeadDTO } from '../types.js';

interface Props {
  lead: LeadDTO | undefined;
  isLoading: boolean;
  isError: boolean;
}

const ESTADO_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  en_gestion: 'En gestión',
  pago_pendiente: 'Pago pendiente',
  pagado: 'Pagado',
  perdido: 'Perdido',
};

/** Fecha larga: la trazabilidad se lee una vez y conviene que sea inequívoca, no `12/03`. */
function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Acciones secundarias del lead. Vive tras un menú de desbordamiento y no como botón visible: el
 * trabajo normal con un lead es gestionarlo, no borrarlo. Es un componente aparte para que el hook
 * de borrado solo exista cuando hay un lead que borrar.
 */
function LeadActions({ lead }: { lead: LeadDTO }): React.ReactElement {
  const [confirmando, setConfirmando] = useState(false);
  // `contacto.id` ES el `clienteId` de la conversación de origen: lo que hay que refrescar para que
  // la cabecera vuelva a ofrecer "Convertir en lead".
  const eliminar = useDeleteLead(lead.id, lead.contacto.id);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1.5 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Acciones del lead"
            title="Acciones del lead"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive-subtle focus:text-destructive"
            onSelect={() => setConfirmando(true)}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar lead…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteLeadDialog
        open={confirmando}
        pending={eliminar.isPending}
        nombre={lead.nombre}
        onOpenChange={setConfirmando}
        onConfirm={(motivo) =>
          eliminar.mutate(motivo, { onSuccess: () => setConfirmando(false) })
        }
      />
    </>
  );
}

export function LeadCard({ lead, isLoading, isError }: Props): React.ReactElement {
  return (
    <section
      className="space-y-2.5 rounded-lg border border-border bg-card px-3.5 py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
      aria-label="Lead"
    >
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Lead</h3>
        {lead && (
          <>
            <Badge variant="secondary" className="ml-auto shrink-0">
              {ESTADO_LABEL[lead.estado] ?? lead.estado}
            </Badge>
            <LeadActions lead={lead} />
          </>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-1.5" aria-live="polite" aria-busy="true">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      ) : isError || !lead ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          No se pudo cargar el lead.
        </p>
      ) : (
        <>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{lead.nombre}</p>
            <p className="truncate text-xs text-muted-foreground">{lead.telefono}</p>
            {lead.correo && (
              <p className="truncate text-xs text-muted-foreground">{lead.correo}</p>
            )}
          </div>

          {/* La trazabilidad es la razón de ser de este feature (DoD de HU-CRM-01), así que va
              destacada en su propio bloque, no como una fila de metadatos al pie. */}
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Convertido por{' '}
            <span className="font-medium text-foreground">
              {lead.origen.convertidoPor?.nombre ?? 'un administrador'}
            </span>{' '}
            desde esta conversación el {fechaLarga(lead.origen.convertidoAt)}.
          </p>

          {lead.responsable && (
            <p className="text-xs text-muted-foreground">
              Responsable:{' '}
              <span className="font-medium text-foreground">
                {lead.responsable.nombre ?? 'sin nombre'}
              </span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

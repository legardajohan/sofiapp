import { useState } from 'react';
import { AlertCircle, ChevronsRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ContactEditDialog } from '@/features/contacts/components/ContactEditDialog';
import { ContactNotesCard } from '@/features/contacts/components/ContactNotesCard';
import { ContactCard } from './ContactCard.js';
import { ContactExtractCard } from './ContactExtractCard.js';
import { ContactSummaryCard } from './ContactSummaryCard.js';
import { ConversationThread } from './ConversationThread.js';
import { LeadCard } from '@/features/leads/components/LeadCard';
import { useLead } from '@/features/leads/hooks/useLead';
import {
  useContactHistory,
  useExtractContactData,
  useGenerateSummary,
} from '../hooks/useContactHistory.js';
import { errorMessage } from '../lib/errors.js';

const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

interface Props {
  clienteId: string | null;
  /** `true` = desplegada; `false` = colapsada (no renderiza nada). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PanelSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
    </div>
  );
}

export function ContactPanel({ clienteId, open, onOpenChange }: Props): React.ReactElement | null {
  // La ficha solo se consulta mientras el panel está desplegado: colapsado no gasta peticiones.
  const { data: history, isLoading, isError } = useContactHistory(open ? clienteId : null);
  const generate = useGenerateSummary(clienteId);
  const extract = useExtractContactData(clienteId);
  const [editando, setEditando] = useState(false);
  // El `leadId` ya viene resuelto en la ficha, así que esto solo hidrata el detalle del lead.
  const lead = useLead(history?.contacto.leadId ?? null);

  // Colapsada no deja rastro en el layout: el control para volver a abrirla es el avatar del
  // contacto en la cabecera de la conversación, no una franja propia.
  if (!open) return null;

  return (
    <aside
      aria-label="Ficha del contacto"
      className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-background"
    >
      <header className="flex items-start gap-2 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="text-base font-semibold text-foreground">Ficha del contacto</h2>
          <p className="text-sm text-muted-foreground">Historial completo y resumen.</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1.5 shrink-0"
          aria-expanded
          aria-label="Colapsar la ficha del contacto"
          title="Colapsar la ficha del contacto"
          onClick={() => onOpenChange(false)}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </header>

      {isLoading ? (
        <PanelSkeleton />
      ) : isError || !history ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No se pudo cargar la ficha del contacto.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 overflow-y-auto border-b border-border px-5 py-4">
            <ContactCard contacto={history.contacto} />
            {/* Editar es la acción principal de la ficha, pero no compite con las tarjetas de IA:
                va justo bajo los datos que modifica, en variante `outline`. */}
            <Button
              variant="outline"
              size="sm"
              className={cn('w-full', pressable)}
              onClick={() => setEditando(true)}
            >
              <Pencil className="h-4 w-4" />
              Editar datos
            </Button>
            {/* Solo si ya se convirtió (HU-CRM-01): la invitación a convertir vive en la cabecera
                del hilo, no aquí, para no ofrecer la misma acción en dos sitios. */}
            {history.contacto.leadId && (
              <LeadCard lead={lead.data} isLoading={lead.isLoading} isError={lead.isError} />
            )}
            {/* Orden del panel tras el merge HU-CRM-01 + HU-CRM-02: identidad → la acción que la
                edita → estado comercial → contenido escrito por el asesor → asistencias de IA. Las
                dos últimas van al final a propósito: lo que el equipo registró a mano manda sobre
                lo que el modelo infirió, y leerlo en ese orden evita confundir dato con sugerencia. */}
            <ContactNotesCard
              clienteId={history.contacto.id}
              puedeVerSensibles={history.contacto.puedeVerSensibles}
            />
            <ContactExtractCard
              datos={history.datosExtraidos}
              pending={extract.isPending}
              error={
                extract.isError
                  ? errorMessage(extract.error, 'No se pudieron extraer los datos.')
                  : null
              }
              onExtract={() => extract.mutate()}
            />
            <ContactSummaryCard
              resumen={history.resumen}
              pending={generate.isPending}
              onGenerate={() => generate.mutate()}
            />
          </div>
          <ConversationThread messages={history.mensajes.data} isLoading={false} />

          {/* Fuera del contenedor con scroll: Radix lo lleva a un portal, así que anidarlo dentro
              de un `overflow-y-auto` solo confunde al leer el árbol. */}
          {/* La extracción de IA (HU-OMNI-03) alimenta el formulario: propone lo que el contacto
              todavía no tiene registrado, sin pisar lo ya guardado. */}
          <ContactEditDialog
            contacto={history.contacto}
            datosExtraidos={history.datosExtraidos}
            open={editando}
            onOpenChange={setEditando}
          />

        </div>
      )}
    </aside>
  );
}

import { AlertCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactCard } from './ContactCard.js';
import { ContactSummaryCard } from './ContactSummaryCard.js';
import { ConversationThread } from './ConversationThread.js';
import { useContactHistory, useGenerateSummary } from '../hooks/useContactHistory.js';

interface Props {
  clienteId: string | null;
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

export function ContactPanel({ clienteId, open, onOpenChange }: Props): React.ReactElement {
  // La ficha solo se consulta mientras el panel está abierto.
  const { data: history, isLoading, isError } = useContactHistory(open ? clienteId : null);
  const generate = useGenerateSummary(clienteId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="space-y-0.5 border-b border-border px-5 py-4 text-left">
          <SheetTitle className="text-base">Ficha del contacto</SheetTitle>
          <SheetDescription>Historial completo y resumen de la conversación.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <PanelSkeleton />
        ) : isError || !history ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
            <AlertCircle className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No se pudo cargar la ficha del contacto.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-4 border-b border-border px-5 py-4">
              <ContactCard contacto={history.contacto} />
              <ContactSummaryCard
                resumen={history.resumen}
                pending={generate.isPending}
                onGenerate={() => generate.mutate()}
              />
            </div>
            <ConversationThread messages={history.mensajes.data} isLoading={false} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

import { RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shortTime } from '../lib/format.js';
import type { ResumenDTO } from '../types.js';

interface Props {
  resumen: ResumenDTO | null;
  pending: boolean;
  onGenerate: () => void;
}

// Press feedback (Emil): transición explícita de transform + escala sutil al presionar.
const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

export function ContactSummaryCard({ resumen, pending, onGenerate }: Props): React.ReactElement {
  const desactualizado = resumen?.desactualizado ?? false;

  return (
    <section className="space-y-2.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Resumen IA</h3>
        {desactualizado && (
          <Badge variant="secondary" className="ml-auto font-normal">
            Desactualizado
          </Badge>
        )}
      </div>

      {pending ? (
        <div className="space-y-1.5" aria-live="polite" aria-busy="true">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[92%]" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : resumen ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {resumen.texto}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Generado {shortTime(resumen.generadoAt)}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Genera un resumen para tener el contexto de la conversación de un vistazo.
        </p>
      )}

      <Button
        variant={resumen ? 'outline' : 'default'}
        size="sm"
        disabled={pending}
        onClick={onGenerate}
        className={cn('w-full', pressable)}
      >
        {resumen ? (
          <>
            <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
            {desactualizado ? 'Actualizar resumen' : 'Regenerar'}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generar resumen
          </>
        )}
      </Button>
    </section>
  );
}

import { IdCard, RefreshCw, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shortTime } from '../lib/format.js';
import type { DatosExtraidosDTO, TelefonoOrigen } from '../types.js';

interface Props {
  datos: DatosExtraidosDTO | null;
  pending: boolean;
  error: string | null;
  onExtract: () => void;
}

// Press feedback (Emil): mismo gesto que ContactSummaryCard, para que ambas acciones se sientan igual.
const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

const ORIGEN_LABEL: Record<TelefonoOrigen, string> = {
  conversacion: 'indicado en el chat',
  whatsapp: 'número de WhatsApp',
};

function Campo({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-right text-xs',
          // Un campo sin dato se marca como ausencia explícita, no como si estuviera vacío por error.
          value ? 'font-medium text-foreground' : 'italic text-muted-foreground',
        )}
      >
        <span className="block truncate">{value ?? 'No aparece en la conversación'}</span>
        {value && hint && (
          <span className="block truncate text-[10px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}

export function ContactExtractCard({ datos, pending, error, onExtract }: Props): React.ReactElement {
  return (
    <section className="space-y-2.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <IdCard className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Datos de contacto (IA)</h3>
      </div>

      {pending ? (
        <div className="space-y-1.5" aria-live="polite" aria-busy="true">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[85%]" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : datos ? (
        <>
          <dl className="space-y-1.5">
            <Campo label="Nombre completo" value={datos.nombreCompleto} />
            <Campo label="Correo" value={datos.correo} />
            <Campo
              label="Teléfono"
              value={datos.telefono}
              hint={ORIGEN_LABEL[datos.telefonoOrigen]}
            />
          </dl>
          <p className="text-[11px] text-muted-foreground">Extraído {shortTime(datos.extraidoAt)}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Extrae el nombre completo, el correo y el teléfono que el cliente haya mencionado en la
          conversación.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <Button
        variant={datos ? 'outline' : 'default'}
        size="sm"
        disabled={pending}
        onClick={onExtract}
        className={cn('w-full', pressable)}
      >
        {datos ? (
          <>
            <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
            Volver a extraer
          </>
        ) : (
          <>
            <ScanLine className="h-4 w-4" />
            Extraer datos
          </>
        )}
      </Button>
    </section>
  );
}

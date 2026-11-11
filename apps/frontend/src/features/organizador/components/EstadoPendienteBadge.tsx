import { cn } from '@/lib/utils';
import { ETIQUETA_ESTADO } from '../lib/organizador.js';
import type { EstadoOrganizador } from '../types.js';

// El color solo dice urgencia: rojo para lo vencido, verde para lo cerrado, primario tenue para lo
// reprogramado y neutro para lo que aún no toca.
const ESTILO: Record<EstadoOrganizador, string> = {
  pendiente: 'border-border bg-muted text-muted-foreground',
  vencido: 'border-destructive/20 bg-destructive-subtle text-destructive',
  pospuesto: 'border-primary/20 bg-primary/10 text-primary',
  cerrado: 'border-success/20 bg-success-subtle text-success',
};

export function EstadoPendienteBadge({ estado }: { estado: EstadoOrganizador }): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-px text-[11px] font-medium',
        ESTILO[estado],
      )}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

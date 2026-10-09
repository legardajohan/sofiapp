import { Skeleton } from '@/components/ui/skeleton';
import { formatearNumero } from '../lib/pacing.js';
import type { SegmentPreviewDTO } from '../types.js';

interface Props {
  cargando: boolean;
  preview: SegmentPreviewDTO | undefined;
}

/**
 * Cuánta gente entra en el segmento, con algunos nombres de muestra. Compartido por el wizard de
 * envío inmediato y el programador: la pregunta «¿a quién?» se responde igual en los dos.
 */
export function SegmentCount({ cargando, preview }: Props): React.ReactElement {
  const total = preview?.total ?? 0;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      {cargando ? (
        <Skeleton className="h-5 w-40" />
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ningún contacto cumple estos filtros. Prueba a quitar alguno.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-foreground">
            <span className="font-semibold tabular-nums">{formatearNumero(total)}</span>{' '}
            {total === 1 ? 'contacto entra' : 'contactos entran'} en este segmento.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {preview?.muestra.slice(0, 4).map((c) => (
              <li key={c.id} className="truncate">
                {c.nombre ?? c.telefono}
              </li>
            ))}
            {total > 4 ? <li aria-hidden>y {formatearNumero(total - 4)} más</li> : null}
          </ul>
        </div>
      )}
    </div>
  );
}

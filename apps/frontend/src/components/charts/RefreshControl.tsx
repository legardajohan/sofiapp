import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatHoraCorta } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  onRefresh: () => void;
  isRefreshing: boolean;
  /** `dataUpdatedAt` de la query principal; sin dato no se muestra la hora. */
  updatedAt: number | undefined;
}

/**
 * "Actualizar" de los tableros (HU-REP-05, D4). Gira mientras hay cualquier carga en curso —también
 * el refresco automático— para que se note que las cifras van a cambiar.
 */
export function RefreshControl({ onRefresh, isRefreshing, updatedAt }: Props): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {updatedAt ? `Actualizado a las ${formatHoraCorta(updatedAt)}` : null}
      </span>
      {/* Alto por defecto (h-9): queda a ras de los selects de periodo con los que comparte fila. */}
      <Button variant="outline" onClick={onRefresh} disabled={isRefreshing} aria-busy={isRefreshing}>
        <RefreshCw aria-hidden="true" className={cn(isRefreshing && 'animate-spin motion-reduce:animate-none')} />
        Actualizar
      </Button>
    </div>
  );
}

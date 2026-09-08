import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto del tablero. Cuatro columnas y un número decreciente de tarjetas: un embudo real se
 * estrecha, y un esqueleto de columnas idénticas anuncia una forma que los datos no van a tener.
 */
export function PipelineSkeleton(): React.ReactElement {
  return (
    <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando el embudo…</span>
      {[3, 2, 2, 1].map((tarjetas, columna) => (
        <div
          key={columna}
          className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2"
        >
          <div className="flex items-center gap-2 px-1 py-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-6" />
          </div>
          {Array.from({ length: tarjetas }).map((_, tarjeta) => (
            <Skeleton key={tarjeta} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

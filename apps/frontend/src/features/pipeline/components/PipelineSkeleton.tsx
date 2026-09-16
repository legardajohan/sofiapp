import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto del tablero.
 *
 * Misma silueta que el tablero real —columnas de altura fija, cabecera propia, tarjetas dentro—
 * para que al llegar los datos nada se mueva de sitio: un esqueleto que no coincide con lo que
 * viene detrás produce un salto que se lee como un error de carga.
 *
 * Un número decreciente de tarjetas por columna, porque un embudo real se estrecha; columnas
 * idénticas anunciarían una forma que los datos no van a tener.
 */
export function PipelineSkeleton(): React.ReactElement {
  return (
    <div
      className="flex h-[min(70vh,44rem)] min-h-[24rem] gap-3 overflow-hidden pb-3"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando el embudo…</span>
      {[3, 2, 2, 1].map((tarjetas, columna) => (
        <div
          key={columna}
          className="flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/40"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-5" />
          </div>
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: tarjetas }).map((_, tarjeta) => (
              <Skeleton key={tarjeta} className="h-[76px] w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

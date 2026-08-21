import { Plus, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { IKbDocument } from '../types/index.js';
import { KnowledgeCard } from './KnowledgeCard.js';

interface KnowledgeGridProps {
  /** Lista ya fusionada por `buildKbGrid`: presets en orden fijo + documentos libres. */
  documents: IKbDocument[];
  isLoading: boolean;
  isError: boolean;
  /** Hay filtros activos: cambia el mensaje cuando la lista queda vacía. */
  isFiltered: boolean;
  onRetry: () => void;
  onOpen: (doc: IKbDocument) => void;
  onCreate: () => void;
  onClearFilters: () => void;
}

function CardSkeleton(): React.ReactElement {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <Skeleton className="mt-auto h-3 w-2/3" />
    </div>
  );
}

/**
 * Grilla única de conocimiento: dos columnas de tarjetas y, al final, la acción de crear.
 *
 * Toda la audacia visual de la vista se concentra en esa última tarjeta (`bg-primary`); el resto se
 * mantiene deliberadamente sobrio para que el ojo encuentre primero lo que falta y luego la salida.
 */
export function KnowledgeGrid({
  documents,
  isLoading,
  isError,
  isFiltered,
  onRetry,
  onOpen,
  onCreate,
  onClearFilters,
}: KnowledgeGridProps): React.ReactElement {
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        aria-busy="true"
        aria-label="Cargando conocimiento"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Con la query en error `documents` llega vacío y la fusión devolvería 5 presets virtuales:
  // pintarlos afirmaría que el tenant no tiene conocimiento cargado, cuando lo que pasó es que no
  // se pudo leer. El aviso ocupa el lugar de la grilla en vez de acompañarla.
  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-subtle p-4 text-sm">
        <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium text-destructive">No se pudo cargar tu conocimiento</p>
          <p className="mt-0.5 text-destructive/90">
            Revisa tu conexión y vuelve a intentarlo. Nada de lo que ya cargaste se perdió.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="flex-shrink-0">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/*
        Sin coincidencias no se vacía la grilla: la acción de crear sigue ahí, porque "no existe lo
        que buscas" y "puedes crearlo" son la misma conversación. El aviso ocupa el ancho completo
        para que se lea antes que la tarjeta.
      */}
      {documents.length === 0 && isFiltered && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-card p-4 sm:col-span-2">
          <p className="text-sm font-medium text-foreground">Sin resultados</p>
          <p className="text-sm text-secondary-foreground">
            Ningún conocimiento coincide con lo que buscas. Ajusta el nombre o los filtros.
          </p>
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        </div>
      )}

      {documents.map((doc) => (
        <KnowledgeCard key={doc.id} doc={doc} onOpen={onOpen} />
      ))}

      <button
        type="button"
        onClick={onCreate}
        className="group flex h-full min-h-28 flex-col items-center justify-center gap-1.5 rounded-xl bg-primary p-4 text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-2 focus:ring-offset-background"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15 transition-transform duration-150 ease-out motion-safe:group-hover:scale-105">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">Agregar nuevo conocimiento</span>
        <span className="text-xs text-primary-foreground/75">
          Crea una categoría propia de tu negocio
        </span>
      </button>
    </div>
  );
}

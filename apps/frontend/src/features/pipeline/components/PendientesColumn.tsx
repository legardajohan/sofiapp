import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { esSinPermiso } from '@/features/contacts/lib/errors';
import { usePendientes, useReabrirPendiente } from '../hooks/usePendientes.js';
import { useGestionPendienteStore } from '@/features/organizador/useGestionPendienteStore';
import { desdeEmbudo } from '@/features/organizador/lib/organizador';
import { PendienteCard } from './PendienteCard.js';
import { PendientesPdfPopover } from './PendientesPdfPopover.js';
import type { EstadoPendiente, PendienteDTO } from '../types.js';

type Pestana = 'abiertos' | 'historial';

const VACIO: Record<EstadoPendiente, string> = {
  abierto:
    'Sin pendientes abiertos. Activa «Marcar como pendiente» al guardar una nota en la ficha del contacto y aparecerá aquí.',
  cerrado: 'Aún no hay pendientes cerrados. Cuando cierres uno, quedará archivado aquí.',
};

interface ListaProps {
  estado: EstadoPendiente;
  /** El historial no se pide hasta que alguien abre su pestaña. */
  habilitado: boolean;
  onAbrir: (pendiente: PendienteDTO) => void;
}

/** El contenido de una pestaña: tarjetas, estados de carga/error/vacío y «Cargar más». */
function ListaPendientes({ estado, habilitado, onAbrir }: ListaProps): React.ReactElement {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePendientes(estado, habilitado);
  // HU-PDF-02 (D3): cerrar exige motivo también desde el embudo — abre el mismo modal que el
  // Organizador. Reabrir sigue siendo directo desde el historial.
  const abrirGestion = useGestionPendienteStore((s) => s.abrir);
  const reabrir = useReabrirPendiente();

  const pendientes = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const enCurso = reabrir.isPending ? reabrir.variables : null;

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-2 py-8 text-center">
        <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
        <p className="text-xs text-foreground">No se pudieron cargar los pendientes.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (pendientes.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
        {VACIO[estado]}
      </p>
    );
  }

  return (
    <>
      {pendientes.map((p) => (
        <PendienteCard
          key={p.id}
          pendiente={p}
          onAbrir={onAbrir}
          ocupado={enCurso === p.id}
          {...(estado === 'abierto'
            ? { onCerrar: (x: PendienteDTO) => abrirGestion(desdeEmbudo(x), 'cerrar') }
            : { onReabrir: (x: PendienteDTO) => reabrir.mutate(x.id) })}
        />
      ))}
      {hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-xs text-muted-foreground"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          Cargar más ({pendientes.length} de {total})
        </Button>
      )}
    </>
  );
}

/**
 * La columna «Pendientes» del embudo (HU-PDF-01, A1).
 *
 * **Se parece a una etapa en tamaño, no en identidad.** Mide lo mismo que las columnas de etapa
 * para que el tablero no se dente, pero se lee como otra cosa: borde discontinuo, fondo de página
 * en vez del `muted` de las etapas y cabecera sin teñir. Tampoco es una zona de soltado —no usa
 * `useDroppable`— ni sus tarjetas se arrastran: un pendiente no avanza por el embudo.
 *
 * Dos pestañas: **Abiertos**, en orden de agenda, y **Historial**, los cerrados. El historial vive
 * en la misma columna y no en otra pantalla: es el archivo de lo que ya se hizo con estos mismos
 * leads, y consultarlo no debería sacar al asesor del embudo.
 *
 * Sin permiso para ver notas, el listado responde 403 y la columna no existe (RN8): no es un error
 * que mostrar, es que estos datos no son para este usuario.
 */
export function PendientesColumn(): React.ReactElement | null {
  const [pestana, setPestana] = useState<Pestana>('abiertos');
  const [historialVisto, setHistorialVisto] = useState(false);
  const abiertos = usePendientes('abierto');
  const historial = usePendientes('cerrado', historialVisto);
  const navigate = useNavigate();
  const location = useLocation();

  const abrir = useCallback(
    (pendiente: PendienteDTO) => {
      // La ficha del contacto vive en la bandeja. `volverA` devuelve al embudo tal como estaba.
      const volverA = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/inbox?conversacion=${pendiente.clienteId}&volverA=${volverA}`);
    },
    [navigate, location.pathname, location.search],
  );

  if (esSinPermiso(abiertos.error)) return null;

  const totalAbiertos = abiertos.data?.pages[0]?.total;
  const totalCerrados = historial.data?.pages[0]?.total;

  return (
    <section
      aria-label={`Pendientes, ${totalAbiertos ?? 0} abiertos`}
      className="flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-dashed border-border bg-background"
    >
      <header className="flex shrink-0 items-center gap-2 py-1.5 pl-3 pr-1.5">
        <ClipboardList className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Pendientes</h3>
        <PendientesPdfPopover />
      </header>

      <Tabs
        value={pestana}
        onValueChange={(v) => {
          const siguiente = v as Pestana;
          setPestana(siguiente);
          if (siguiente === 'historial') setHistorialVisto(true);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-dashed border-border px-2 pb-2">
          <TabsList className="grid h-8 w-full grid-cols-2">
            <TabsTrigger value="abiertos" className="h-6 gap-1.5 text-xs">
              Abiertos
              {totalAbiertos !== undefined && (
                <span className="tabular-nums text-muted-foreground">{totalAbiertos}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="historial" className="h-6 gap-1.5 text-xs">
              Historial
              {totalCerrados !== undefined && (
                <span className="tabular-nums text-muted-foreground">{totalCerrados}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Sin animación entre pestañas: se cambia de una a otra decenas de veces al día. */}
        <TabsContent
          value="abiertos"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 data-[state=inactive]:hidden"
        >
          <ListaPendientes estado="abierto" habilitado onAbrir={abrir} />
        </TabsContent>
        <TabsContent
          value="historial"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 data-[state=inactive]:hidden"
        >
          <ListaPendientes estado="cerrado" habilitado={historialVisto} onAbrir={abrir} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

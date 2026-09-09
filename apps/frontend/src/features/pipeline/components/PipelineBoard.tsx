import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeadListItemDTO } from '../../leads/types.js';
import { useMoveLeadStage } from '../hooks/useMoveLeadStage.js';
import { usePipeline } from '../hooks/usePipeline.js';
import { usePipelineRealtime } from '../hooks/usePipelineRealtime.js';
import { PipelineCard } from './PipelineCard.js';
import { PipelineColumn } from './PipelineColumn.js';
import { PipelineSkeleton } from './PipelineSkeleton.js';
import type { PipelineFiltros } from '../types.js';

interface Props {
  filtros: PipelineFiltros;
  onSelect: (lead: LeadListItemDTO) => void;
  onVerEnTabla: (estadoKey: string) => void;
}

/**
 * El embudo: una columna por etapa, con las oportunidades arrastrables entre ellas.
 *
 * `pointerWithin` en vez de la detección por rectángulos por defecto: las columnas son altas y se
 * solapan poco, así que lo que importa es dónde está el cursor, no cuánto se solapan las cajas.
 */
export function PipelineBoard({ filtros, onSelect, onVerEnTabla }: Props): React.ReactElement {
  const { data, isLoading, isError, refetch } = usePipeline(filtros);
  const mover = useMoveLeadStage(filtros);
  usePipelineRealtime();

  const [arrastrando, setArrastrando] = useState<LeadListItemDTO | null>(null);

  // Un índice plano para resolver la tarjeta que se arrastra sin recorrer las columnas en cada
  // evento de arrastre, que se disparan muchas veces por segundo.
  const porId = useMemo(() => {
    const mapa = new Map<string, LeadListItemDTO>();
    for (const columna of data?.columnas ?? []) {
      for (const lead of columna.leads) mapa.set(lead.id, lead);
    }
    return mapa;
  }, [data]);

  const sensores = useSensors(
    // 6px de holgura: sin ella, un clic para abrir el lead se interpretaría como el inicio de un
    // arrastre y el panel no se abriría nunca.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const etiquetaDe = useCallback(
    (key: string) => data?.columnas.find((c) => c.etapa.key === key)?.etapa.label ?? key,
    [data],
  );

  /** Anuncios para lector de pantalla: sin ellos, mover con el teclado es mover a ciegas. */
  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) =>
        `Has levantado la oportunidad ${porId.get(String(active.id))?.nombre ?? ''}.`,
      onDragOver: ({ over }) =>
        over ? `Sobre la etapa ${etiquetaDe(String(over.id))}.` : 'Fuera de toda etapa.',
      onDragEnd: ({ over }) =>
        over
          ? `Oportunidad movida a ${etiquetaDe(String(over.id))}.`
          : 'Movimiento cancelado: la oportunidad vuelve a su etapa.',
      onDragCancel: () => 'Movimiento cancelado: la oportunidad vuelve a su etapa.',
    }),
    [porId, etiquetaDe],
  );

  const onDragStart = useCallback(
    ({ active }: DragStartEvent) => setArrastrando(porId.get(String(active.id)) ?? null),
    [porId],
  );

  const onDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setArrastrando(null);
      if (!over) return;

      const destino = String(over.id);
      const lead = porId.get(String(active.id));
      // Soltarla en la columna de la que salió no es un error, pero tampoco un cambio: ahorrarse
      // la petición evita un parpadeo del tablero por un gesto que no movió nada.
      if (!lead || lead.estado === destino) return;

      mover.mutate({ id: lead.id, estado: destino });
    },
    [porId, mover],
  );

  if (isLoading) return <PipelineSkeleton />;

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center"
      >
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm text-foreground">No se pudo cargar el embudo.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!data || data.columnas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">El embudo no tiene etapas activas.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Todas las etapas de la empresa están archivadas. Reactiva al menos una en el catálogo de
          etapas para poder organizar las oportunidades aquí.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={pointerWithin}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setArrastrando(null)}
    >
      {/* El scroll horizontal vive aquí y no en el `main`: el tablero se desplaza dentro de la
          página, sin arrastrar consigo la cabecera ni los filtros.

          Altura fija para todas las columnas, cada una con su propio scroll. Dejarlas crecer con su
          contenido dentaba el tablero —una columna de nueve tarjetas al lado de una vacía— y hacía
          que el borde inferior, que es la superficie donde se sueltan las tarjetas, cambiara de
          sitio en cada movimiento. */}
      <div className="flex h-[min(70vh,44rem)] min-h-[24rem] gap-3 overflow-x-auto pb-3">
        {data.columnas.map((columna) => (
          <PipelineColumn
            key={columna.etapa.key}
            columna={columna}
            onSelect={onSelect}
            onVerEnTabla={onVerEnTabla}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}>
        {arrastrando ? <PipelineCard lead={arrastrando} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

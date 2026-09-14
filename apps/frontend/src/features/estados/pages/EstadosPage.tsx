import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Columns3, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EliminarEtapaDialog } from '../components/EliminarEtapaDialog.js';
import { EstadoFormDialog, type ValoresEtapa } from '../components/EstadoFormDialog.js';
import { EtapaArchivada, EtapaFila, EtapaFilaOverlay } from '../components/EtapaFila.js';
import {
  useCreateEstado,
  useDeleteEstado,
  useEstadosConUso,
  useReorderEstados,
  useUpdateEstado,
} from '../hooks/useEstados.js';
import { bloqueoEnError } from '../lib/bloqueo.js';
import type { EstadoDTO } from '../types.js';

/**
 * Solo eje Y. La lista es vertical y dejar que la fila derive en horizontal no comunica nada: el
 * único destino posible es otra posición del carril.
 *
 * Escrito a mano en vez de traer `@dnd-kit/modifiers`: es una línea, y no vale añadir una
 * dependencia al bundle para ella.
 */
const soloVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Gestión del embudo: crear, ordenar, renombrar, recolorear, archivar y eliminar sus etapas.
 *
 * Las etapas son datos del tenant (HU-CRM-03) y el tablero dibuja **una columna por etapa activa**
 * en el orden de este listado (HU-PIPE-01), así que esta pantalla es donde se decide la forma del
 * embudo. Dos cosas la definen:
 *
 * - **El orden se arrastra.** El que sale del alta es el de creación, que no es el flujo de ventas:
 *   una etapa nueva nace al final aunque su sitio esté en segunda posición. Reordenar con el gesto
 *   —y no con un campo numérico— es lo que hace que el embudo se pueda pensar mirándolo.
 * - **Trae la cuenta de leads de cada etapa**, que es la cifra que explica, antes de pulsar nada,
 *   por qué una etapa no se puede eliminar.
 */
export function EstadosPage(): React.ReactElement {
  const { data: estados, isLoading } = useEstadosConUso();
  const crear = useCreateEstado();
  const actualizar = useUpdateEstado();
  const borrar = useDeleteEstado();
  const reordenar = useReorderEstados();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<EstadoDTO | null>(null);
  const [porEliminar, setPorEliminar] = useState<EstadoDTO | null>(null);
  const [arrastrando, setArrastrando] = useState<EstadoDTO | null>(null);

  const activas = useMemo(() => estados?.filter((e) => e.activo) ?? [], [estados]);
  const archivadas = useMemo(() => estados?.filter((e) => !e.activo) ?? [], [estados]);
  // Solo las activas: los leads que quedaron en una etapa archivada no están en el embudo, y
  // sumarlos aquí haría que el total no cuadrara con lo que el tablero muestra.
  const leadsEnEmbudo = useMemo(
    () => activas.reduce((total, e) => total + (e.leads ?? 0), 0),
    [activas],
  );

  const sensores = useSensors(
    // 6px de holgura, igual que en el tablero: sin ella, un clic en un botón de la fila se
    // interpretaría como el inicio de un arrastre y no llegaría a abrir nada.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const posicionDe = useCallback(
    (id: string) => activas.findIndex((e) => e.id === id),
    [activas],
  );
  const nombreDe = useCallback(
    (id: string) => activas.find((e) => e.id === id)?.label ?? '',
    [activas],
  );

  /**
   * Anuncios para lector de pantalla. En una lista reordenable lo que importa no es sobre qué
   * elemento estás, sino **en qué posición de cuántas**: sin eso, mover con el teclado es contar a
   * ciegas.
   */
  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) =>
        `Has levantado la etapa ${nombreDe(String(active.id))}, posición ${
          posicionDe(String(active.id)) + 1
        } de ${activas.length}.`,
      onDragOver: ({ over }) =>
        over ? `Sobre la posición ${posicionDe(String(over.id)) + 1} de ${activas.length}.` : '',
      onDragEnd: ({ active, over }) =>
        over
          ? `Etapa ${nombreDe(String(active.id))} colocada en la posición ${
              posicionDe(String(over.id)) + 1
            } de ${activas.length}.`
          : 'Movimiento cancelado: la etapa vuelve a su posición.',
      onDragCancel: () => 'Movimiento cancelado: la etapa vuelve a su posición.',
    }),
    [activas.length, nombreDe, posicionDe],
  );

  const onDragStart = useCallback(
    ({ active }: DragStartEvent) =>
      setArrastrando(activas.find((e) => e.id === active.id) ?? null),
    [activas],
  );

  const onDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setArrastrando(null);
      // Soltarla donde estaba no es un error, pero tampoco un cambio: ahorrarse la petición evita
      // un parpadeo del listado por un gesto que no movió nada.
      if (!over || active.id === over.id) return;

      const desde = activas.findIndex((e) => e.id === active.id);
      const hasta = activas.findIndex((e) => e.id === over.id);
      if (desde < 0 || hasta < 0) return;

      // El backend exige la lista completa del catálogo; las archivadas van detrás, en el orden que
      // ya tenían, porque comparten la escala de `orden` con las activas.
      const nuevas = arrayMove(activas, desde, hasta);
      reordenar.mutate([...nuevas.map((e) => e.id), ...archivadas.map((e) => e.id)]);
    },
    [activas, archivadas, reordenar],
  );

  function abrirCrear(): void {
    setEditando(null);
    setFormOpen(true);
  }

  function abrirEditar(estado: EstadoDTO): void {
    setEditando(estado);
    setFormOpen(true);
  }

  function guardar(valores: ValoresEtapa): void {
    if (editando) {
      actualizar.mutate(
        {
          id: editando.id,
          payload: { label: valores.label, color: valores.color, esSalida: valores.esSalida },
        },
        { onSuccess: () => setFormOpen(false) },
      );
      return;
    }
    crear.mutate(
      { label: valores.label, color: valores.color },
      { onSuccess: () => setFormOpen(false) },
    );
  }

  function pedirEliminar(estado: EstadoDTO): void {
    // Se limpia el error del intento anterior: sin esto, el diálogo de la siguiente etapa se abriría
    // ya mostrando el bloqueo de la anterior.
    borrar.reset();
    setPorEliminar(estado);
  }

  function confirmarEliminar(): void {
    if (!porEliminar) return;
    borrar.mutate(porEliminar.id, { onSuccess: () => setPorEliminar(null) });
  }

  function archivar(estado: EstadoDTO, alTerminar?: () => void): void {
    actualizar.mutate({ id: estado.id, payload: { activo: false } }, { onSuccess: alTerminar });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground">Etapas del embudo</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Cada etapa es una columna del tablero, en este orden. Arrástralas para que el recorrido
            siga tu flujo de ventas.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/leads?vista=embudo">
              <Columns3 className="h-4 w-4" />
              Ver el tablero
            </Link>
          </Button>
          <Button
            onClick={abrirCrear}
            className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Crear etapa
          </Button>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          // Misma silueta que la lista real —asa, punto, nombre, cuenta a la derecha— para que al
          // llegar los datos nada se mueva de sitio.
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5">
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                <span className="flex w-3 shrink-0 justify-center">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                </span>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-3 w-14 shrink-0" />
                <span aria-hidden="true" className="w-[6.5rem] shrink-0" />
              </div>
            ))}
          </div>
        ) : activas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Columns3 className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                El embudo no tiene etapas activas
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Crea la primera o reactiva una archivada: sin etapas activas el tablero no puede
                organizar las oportunidades.
              </p>
            </div>
            <Button variant="outline" onClick={abrirCrear}>
              <Plus className="h-4 w-4" />
              Crear etapa
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensores}
            // `closestCenter` y no `pointerWithin`: en una lista vertical de filas contiguas lo que
            // decide el destino es qué fila tiene el centro más cerca, no si el cursor cayó dentro.
            collisionDetection={closestCenter}
            modifiers={[soloVertical]}
            accessibility={{ announcements }}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setArrastrando(null)}
          >
            <SortableContext items={activas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <ul>
                {activas.map((estado, i) => (
                  <EtapaFila
                    key={estado.id}
                    estado={estado}
                    primera={i === 0}
                    ultima={i === activas.length - 1}
                    onEditar={() => abrirEditar(estado)}
                    onArchivar={() => archivar(estado)}
                    onEliminar={() => pedirEliminar(estado)}
                  />
                ))}
              </ul>
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}>
              {arrastrando ? <EtapaFilaOverlay estado={arrastrando} /> : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* El total cierra la tarjeta y responde lo que la lista deja a medias: cuántas etapas tiene
            el embudo y cuánta cartera hay dentro. Sumar seis cifras a ojo es trabajo que ya está
            hecho aquí. */}
        {!isLoading && activas.length > 0 && (
          <footer className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span>{activas.length === 1 ? '1 etapa activa' : `${activas.length} etapas activas`}</span>
            <span className="tabular-nums">
              {leadsEnEmbudo === 1 ? '1 lead en el embudo' : `${leadsEnEmbudo} leads en el embudo`}
            </span>
          </footer>
        )}
      </div>

      {archivadas.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-medium text-foreground">Archivadas</h2>
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
              Fuera del tablero y de los filtros, pero los leads que las tienen siguen mostrando su
              nombre.
            </p>
          </div>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {archivadas.map((estado) => (
              <EtapaArchivada
                key={estado.id}
                estado={estado}
                pendiente={actualizar.isPending}
                onReactivar={() => actualizar.mutate({ id: estado.id, payload: { activo: true } })}
                onEliminar={() => pedirEliminar(estado)}
              />
            ))}
          </ul>
        </section>
      )}

      <EstadoFormDialog
        estado={editando}
        open={formOpen}
        pending={crear.isPending || actualizar.isPending}
        onOpenChange={setFormOpen}
        onSubmit={guardar}
      />

      <EliminarEtapaDialog
        etapa={porEliminar}
        bloqueo={bloqueoEnError(borrar.error)}
        borrando={borrar.isPending}
        archivando={actualizar.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) setPorEliminar(null);
        }}
        onConfirmar={confirmarEliminar}
        onArchivar={() => {
          if (porEliminar) archivar(porEliminar, () => setPorEliminar(null));
        }}
        onVerLeads={() => {
          if (porEliminar) navigate(`/leads?estado=${encodeURIComponent(porEliminar.key)}`);
        }}
      />
    </div>
  );
}

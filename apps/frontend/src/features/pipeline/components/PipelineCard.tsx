import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fechaCorta } from '../../leads/lib/format.js';
import type { LeadListItemDTO } from '../../leads/types.js';

interface Props {
  lead: LeadListItemDTO;
  /** Solo en la copia que sigue al cursor (`DragOverlay`), que no es arrastrable ella misma. */
  overlay?: boolean;
  onSelect?: (lead: LeadListItemDTO) => void;
}

/** Punto de color del semáforo. El color lo decide el tenant, por eso va en `style`. */
function Punto({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/** El contenido de la tarjeta, compartido por la del tablero y la que sigue al cursor. */
function Contenido({ lead }: { lead: LeadListItemDTO }): React.ReactElement {
  const semaforo = lead.semaforos[0];

  return (
    <>
      <div className="min-w-0 pr-5">
        <p className="truncate text-sm font-medium leading-snug text-foreground">{lead.nombre}</p>
        <p className="truncate text-xs text-muted-foreground">{lead.telefono}</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {semaforo && (
          <span className="flex min-w-0 items-center gap-1.5">
            <Punto color={semaforo.color} />
            <span className="truncate">{semaforo.nombre}</span>
          </span>
        )}
        <span className="ml-auto shrink-0 tabular-nums">{fechaCorta(lead.createdAt)}</span>
      </div>

      {lead.responsable?.nombre && (
        <p className="truncate text-xs text-muted-foreground">{lead.responsable.nombre}</p>
      )}
    </>
  );
}

const BASE =
  'group relative flex w-full flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left';

/**
 * Una oportunidad en el tablero.
 *
 * **El arrastre vive en un asa propia, no en toda la tarjeta.** Con la tarjeta entera como
 * activador, dos cosas se rompen: el clic para abrir el lead compite con el gesto de arrastre, y
 * el `touch-none` que el arrastre necesita impide desplazar la columna con el dedo — en un móvil
 * la lista quedaría atrapada. Con el asa, cada afordancia dice una sola cosa.
 *
 * El asa es un `button` real y siempre visible (atenuada, no oculta tras `hover`): un asa que solo
 * aparece al pasar el ratón no existe en una pantalla táctil. Al estar enfocable, el sensor de
 * teclado de dnd-kit la alcanza con el tabulador, así que mover un lead sin ratón es posible.
 */
export function PipelineCard({ lead, overlay = false, onSelect }: Props): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled: overlay,
    data: { estado: lead.estado },
  });

  if (overlay) {
    return (
      // `rotate-2` + sombra: la tarjeta se despega del tablero y se lee como "en la mano". Sin la
      // inclinación, la copia y el hueco son indistinguibles y el arrastre parece no haber empezado.
      <div className={cn(BASE, 'w-64 rotate-2 cursor-grabbing shadow-lg ring-1 ring-primary/30')}>
        <Contenido lead={lead} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        BASE,
        // Solo `opacity`: es lo único que cambia aquí, y `transition-all` arrastraría también el
        // `transform` que dnd-kit escribe en cada frame del arrastre.
        'transition-opacity duration-150 ease-out focus-within:border-primary/40 hover:border-primary/40',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect?.(lead)}
        aria-label={`Ver el lead ${lead.nombre}`}
        // Cubre la tarjeta entera para que el objetivo del clic sea la tarjeta y no solo el texto,
        // y se queda por debajo del asa, que va en su propia capa.
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      />

      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-roledescription="Asa de arrastre"
        aria-label={`Mover ${lead.nombre} de etapa`}
        // `touch-none` SOLO aquí: en el resto de la tarjeta el dedo sigue desplazando la columna.
        className="absolute right-1 top-2 z-10 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-40 transition-opacity duration-150 ease-out hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:opacity-70"
      >
        <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
      </button>

      {/* Por encima de la capa del botón para que el texto siga siendo seleccionable, pero sin
          capturar el puntero: el clic lo recibe el botón que hay debajo. */}
      <div className="pointer-events-none relative z-[1] flex flex-col gap-2">
        <Contenido lead={lead} />
      </div>
    </div>
  );
}

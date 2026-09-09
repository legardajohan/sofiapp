import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { initials } from '../../inbox/lib/format.js';
import { fechaCorta, fechaLarga } from '../../leads/lib/format.js';
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

/**
 * El contenido de la tarjeta, compartido por la del tablero y la que sigue al cursor.
 *
 * Tres filas, de más a menos identificador: quién es, cómo contactarlo y cuándo entró, de quién es
 * y cómo va. Escanear una columna es leer la primera línea de cada tarjeta, así que solo el nombre
 * lleva peso; todo lo demás baja a `text-xs` y a `muted-foreground` para no competir con él.
 */
function Contenido({ lead }: { lead: LeadListItemDTO }): React.ReactElement {
  const semaforo = lead.semaforos[0];
  const responsable = lead.responsable?.nombre;

  return (
    <>
      <p className="truncate pr-6 text-sm font-medium leading-snug text-foreground">
        {lead.nombre}
      </p>

      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span className="truncate tabular-nums">{lead.telefono}</span>
        <span className="ml-auto shrink-0 tabular-nums" title={fechaLarga(lead.createdAt)}>
          {fechaCorta(lead.createdAt)}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {responsable ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {/* El avatar de iniciales es el mismo recurso que la bandeja usa para el responsable:
                a tamaño de tarjeta, un nombre se lee más rápido por su forma que por su texto. */}
            <Avatar className="h-4 w-4 shrink-0">
              <AvatarFallback className="text-[9px] font-medium">
                {initials(responsable, lead.telefono)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{responsable}</span>
          </span>
        ) : (
          <span className="truncate italic">Sin responsable</span>
        )}

        {semaforo && (
          <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
            <Punto color={semaforo.color} />
            <span className="truncate">{semaforo.nombre}</span>
          </span>
        )}
      </div>
    </>
  );
}

const BASE =
  'group/card relative flex w-full flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5 text-left';

/**
 * Una oportunidad en el tablero.
 *
 * **El arrastre vive en un asa propia, no en toda la tarjeta.** Con la tarjeta entera como
 * activador, dos cosas se rompen: el clic para abrir el lead compite con el gesto de arrastre, y
 * el `touch-none` que el arrastre necesita impide desplazar la columna con el dedo — en un móvil
 * la lista quedaría atrapada. Con el asa, cada afordancia dice una sola cosa.
 *
 * El asa es un `button` real y **siempre visible**, no revelada al `hover`: un asa que solo aparece
 * con el ratón no existe en una pantalla táctil, y era además lo que hacía que el tablero no
 * pareciera arrastrable a primera vista. Descansa atenuada y se enciende al acercarse; el `title`
 * dice el gesto en palabras, incluido el del teclado, porque un icono no lo explica solo. Al estar
 * enfocable, el sensor de teclado de dnd-kit la alcanza con el tabulador.
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
      <div className={cn(BASE, 'w-72 rotate-2 cursor-grabbing border-border shadow-lg ring-1 ring-primary/30')}>
        <Contenido lead={lead} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        BASE,
        'border-border shadow-[0_1px_2px_rgb(0_0_0/0.04)]',
        // Solo las propiedades que cambian: `transition-all` arrastraría también el `transform`
        // que dnd-kit escribe en cada frame del arrastre.
        'transition-[border-color,box-shadow,opacity,transform] duration-150 ease-out motion-reduce:transition-none',
        'hover:border-primary/30 hover:shadow-md focus-within:border-primary/40',
        // La tarjeta cede al pulsarla: sin esto el clic no se siente atendido hasta que abre el panel.
        'active:scale-[0.99]',
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
        title="Arrastra para cambiar de etapa (o enfoca y pulsa Espacio)"
        // `touch-none` SOLO aquí: en el resto de la tarjeta el dedo sigue desplazando la columna.
        className={cn(
          'absolute right-1.5 top-2 z-10 grid h-6 w-5 place-items-center rounded',
          'cursor-grab touch-none text-muted-foreground/70 active:cursor-grabbing',
          'transition-[color,background-color] duration-150 ease-out motion-reduce:transition-none',
          'hover:bg-accent hover:text-foreground group-hover/card:text-muted-foreground',
          'focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
      </button>

      {/* Por encima de la capa del botón para que el texto siga siendo seleccionable, pero sin
          capturar el puntero: el clic lo recibe el botón que hay debajo. */}
      <div className="pointer-events-none relative z-[1] flex flex-col gap-1.5">
        <Contenido lead={lead} />
      </div>
    </div>
  );
}

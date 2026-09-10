import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, ArchiveRestore, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { KEY_ETAPA_ENTRADA, type EstadoDTO } from '../types.js';

function cuantosLeads(estado: EstadoDTO): string {
  const n = estado.leads ?? 0;
  if (n === 0) return 'Sin leads';
  return n === 1 ? '1 lead' : `${n} leads`;
}

interface Posicion {
  /** Posición en el recorrido: decide si el riel se dibuja hacia arriba, hacia abajo o ambos. */
  primera: boolean;
  ultima: boolean;
}

/**
 * El riel de la izquierda: el punto de la etapa y la línea que la une con la siguiente.
 *
 * **El riel es el embudo.** Estas filas no son una lista cualquiera, son el recorrido que hace una
 * oportunidad, y una línea que une los puntos lo dice sin una palabra —lo mismo que el tablero
 * cuenta con columnas contiguas—. El punto lleva el color de la etapa, que es su firma allí, con un
 * anillo del color de la tarjeta para que la línea no lo atraviese.
 */
function Riel({ color, primera, ultima }: { color: string } & Posicion): React.ReactElement {
  return (
    <div className="relative flex w-3 shrink-0 items-center justify-center self-stretch">
      {!primera && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-border"
        />
      )}
      {!ultima && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className="relative z-[1] h-2.5 w-2.5 rounded-full ring-2 ring-card"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

/**
 * Nombre, insignias y cuántos leads tiene. Compartido por la fila y por la copia que se arrastra.
 *
 * **La cuenta va en su propia columna, alineada a la derecha, no debajo del nombre.** Puestas una
 * sobre otra las cifras se comparan de un vistazo —3, 7, 2, 0 es la forma del embudo, y ver dónde se
 * atasca es para lo que se abre esta pantalla—; como subtítulo de cada fila habría que ir a
 * buscarlas. De paso la fila baja a una sola línea y el recorrido entero cabe sin desplazar.
 */
function Contenido({ estado }: { estado: EstadoDTO }): React.ReactElement {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{estado.label}</span>

        {/* Sentence case y no versalitas, igual que en la cabecera del tablero: una etiqueta en
            mayúsculas a 10px pesa más de lo que informa. */}
        {estado.key === KEY_ETAPA_ENTRADA && (
          <Badge
            variant="secondary"
            className="shrink-0 font-medium"
            title="Aquí entran los leads que se convierten desde una conversación"
          >
            Entrada
          </Badge>
        )}
        {estado.esSalida && (
          <Badge
            variant="outline"
            className="shrink-0 font-medium"
            title="Etapa de salida: aquí termina el recorrido"
          >
            Salida
          </Badge>
        )}
      </div>

      <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {cuantosLeads(estado)}
      </span>
    </>
  );
}

interface Props extends Posicion {
  estado: EstadoDTO;
  onEditar: () => void;
  onArchivar: () => void;
  onEliminar: () => void;
}

/**
 * Una etapa activa del embudo, arrastrable para cambiar su posición en el recorrido.
 *
 * **El arrastre vive en un asa propia**, no en la fila entera: la fila lleva tres botones y un
 * arrastre que arrancara en cualquier punto competiría con ellos. El asa es un `button` real y
 * **siempre visible** —una que solo aparece al pasar el ratón no existe en una pantalla táctil—, y
 * al ser enfocable el sensor de teclado de dnd-kit la alcanza con el tabulador. Mismo criterio, y
 * por los mismos motivos, que las tarjetas del tablero.
 */
export function EtapaFila({
  estado,
  primera,
  ultima,
  onEditar,
  onArchivar,
  onEliminar,
}: Props): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: estado.id,
  });
  const esEntrada = estado.key === KEY_ETAPA_ENTRADA;

  return (
    <li
      ref={setNodeRef}
      // El transform lo escribe dnd-kit en cada frame: es lo que hace que las vecinas se aparten
      // solas en vez de saltar a su nueva posición al soltar.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/fila flex items-center gap-2 border-b border-border bg-card px-3 py-2.5 last:border-b-0',
        // La fila reacciona al pasar por encima: no es clicable, pero es donde viven tres acciones y
        // el asa, y sin ninguna respuesta cuesta saber sobre cuál de seis se está a punto de actuar.
        'transition-colors duration-150 ease-out hover:bg-muted/40 motion-reduce:transition-none',
        // La fila de origen se atenúa mientras su copia sigue al cursor: sin esto la misma etapa se
        // ve dos veces y no queda claro cuál es la que se está moviendo.
        isDragging && 'relative z-10 opacity-40',
      )}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-roledescription="Asa de arrastre"
        aria-label={`Reordenar la etapa ${estado.label}`}
        title="Arrastra para cambiar el orden del embudo (o enfoca y pulsa Espacio)"
        className={cn(
          'grid w-5 shrink-0 place-items-center self-center rounded',
          // `touch-none` solo en el asa: en el resto de la fila el dedo sigue desplazando la página.
          'cursor-grab touch-none text-muted-foreground/70 active:cursor-grabbing',
          'transition-[color,background-color] duration-150 ease-out motion-reduce:transition-none',
          'hover:bg-accent hover:text-foreground',
          'focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <GripVertical aria-hidden="true" className="h-4 w-4" />
      </button>

      <Riel color={estado.color} primera={primera} ultima={ultima} />
      <Contenido estado={estado} />

      <div className="flex shrink-0 items-center gap-1 self-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEditar}
          aria-label={`Editar la etapa ${estado.label}`}
          title="Editar"
          // Atenuados en reposo y a contraste pleno al acercarse: tres botones por fila y seis
          // filas son dieciocho manchas oscuras compitiendo con los nombres, que es lo que se lee.
          className="text-muted-foreground/70 transition-[transform,color] duration-150 ease-out hover:text-foreground motion-safe:active:scale-[0.95]"
        >
          <Pencil className="h-4 w-4" />
        </Button>

        {/* La etapa de entrada no se archiva ni se borra: el backend lo rechaza porque los leads
            nuevos nacen en ella. Se omiten los botones en vez de dejarlos desactivados — un control
            muerto obliga a descubrir por prueba y error algo que la insignia «Entrada» ya explica. */}
        {!esEntrada && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onArchivar}
              aria-label={`Archivar la etapa ${estado.label}`}
              title="Archivar: sale del tablero pero los leads conservan su nombre"
              className="text-muted-foreground/70 transition-[transform,color] duration-150 ease-out hover:text-foreground motion-safe:active:scale-[0.95]"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEliminar}
              aria-label={`Eliminar la etapa ${estado.label}`}
              title="Eliminar"
              className="text-muted-foreground/70 transition-[transform,color] duration-150 ease-out hover:text-destructive motion-safe:active:scale-[0.95]"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * La copia que sigue al cursor mientras se arrastra.
 *
 * Se despega con sombra y anillo, pero **sin inclinarla**: una tarjeta del tablero rotada se lee
 * como «en la mano», y una fila de una lista rotada se lee como que la lista se rompió. Aquí el
 * gesto es deslizar dentro de un carril, no levantar un objeto.
 */
export function EtapaFilaOverlay({ estado }: { estado: EstadoDTO }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-lg ring-1 ring-primary/30">
      <span className="grid w-5 shrink-0 place-items-center self-center text-muted-foreground">
        <GripVertical aria-hidden="true" className="h-4 w-4" />
      </span>
      <Riel color={estado.color} primera={false} ultima={false} />
      <Contenido estado={estado} />
    </div>
  );
}

/**
 * Una etapa archivada. Sin riel y sin asa: ya no forma parte del recorrido, así que no tiene sitio
 * dentro de él que reordenar. El punto se queda hueco por la misma razón.
 */
export function EtapaArchivada({
  estado,
  onReactivar,
  onEliminar,
  pendiente,
}: {
  estado: EstadoDTO;
  onReactivar: () => void;
  onEliminar: () => void;
  pendiente: boolean;
}): React.ReactElement {
  return (
    <li
      className={cn(
        'flex items-center gap-2 border-b border-border px-3 py-2.5 last:border-b-0',
        'transition-colors duration-150 ease-out hover:bg-muted/40 motion-reduce:transition-none',
      )}
    >
      {/* Misma sangría que la activa —el hueco del asa más el del riel— para que las dos listas se
          lean como una sola columna y el ojo no tenga que reencuadrar al bajar. */}
      <span aria-hidden="true" className="w-5 shrink-0" />
      <span className="flex w-3 shrink-0 justify-center">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full border-2"
          style={{ borderColor: estado.color }}
        />
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
        {estado.label}
      </span>
      <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {cuantosLeads(estado)}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={pendiente}
          onClick={onReactivar}
          className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]"
        >
          <ArchiveRestore className="h-4 w-4" />
          Reactivar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onEliminar}
          aria-label={`Eliminar la etapa ${estado.label}`}
          title="Eliminar"
          className="text-muted-foreground/70 transition-[transform,color] duration-150 ease-out hover:text-destructive motion-safe:active:scale-[0.95]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

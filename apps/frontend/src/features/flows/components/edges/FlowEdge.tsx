import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { ArrowDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface FlowEdgeData extends Record<string, unknown> {
  /** Texto corto sobre la línea (lo que se evalúa: `contiene "x"`). Sin él, la línea lleva un
   *  punto con flecha: es la salida lineal de un nodo, que no evalúa nada. */
  etiqueta?: string;
  /** Frase completa del tooltip: qué ocurre al seguir esta línea (`describirRelacion`). */
  descripcion: string;
}

/**
 * Conector del canvas. Dibuja la curva por defecto y pone en su punto medio un control que explica
 * la relación al pasar el mouse o enfocarlo con teclado. El control vive en `EdgeLabelRenderer`
 * (HTML, no SVG) porque un tooltip de Radix necesita un elemento DOM como ancla.
 */
export function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
  data,
}: EdgeProps): React.ReactElement {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const { etiqueta, descripcion } = (data ?? { descripcion: '' }) as FlowEdgeData;

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          // `nodrag nopan`: sin ellos, arrastrar desde el control mueve el canvas en vez de
          // dejarlo quieto. `pointer-events-auto` porque el renderer los desactiva por defecto.
          className="nodrag nopan pointer-events-auto absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={descripcion}
                className={cn(
                  'flex items-center justify-center border bg-card text-muted-foreground',
                  'transition-colors duration-150 ease-out hover:border-primary/60 hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  etiqueta
                    ? 'max-w-40 rounded-full px-2 py-0.5 text-[10px]'
                    : 'size-4 rounded-full',
                  selected ? 'border-primary text-foreground' : 'border-border',
                )}
              >
                {etiqueta ? (
                  <span className="truncate">{etiqueta}</span>
                ) : (
                  <ArrowDown className="size-2.5" aria-hidden="true" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={6}
              className="max-w-64 text-pretty leading-snug data-[state=instant-open]:animate-none"
            >
              {descripcion}
            </TooltipContent>
          </Tooltip>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

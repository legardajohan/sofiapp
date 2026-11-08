import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_VISUALS, filasDeRama, resumenConfig, tieneSalidaLineal } from '../nodeVisuals.js';
import { nombreDeNodo } from '../../lib/graph.js';
import type { INodo } from '../../types.js';
import { ProblemaNodo, type GravedadNodo } from './ProblemaNodo.js';

export interface FlowNodeData extends Record<string, unknown> {
  nodo: INodo;
  esEntrada: boolean;
  /** Error de FORMA que devolvió el servidor al guardar (Zod). */
  error?: string;
  /**
   * Lo que le falta al nodo, calculado en vivo con `analizarGrafo` (HU-FLOW-05). Vacío = listo.
   * `undefined` solo en tests o fuera del editor: el nodo no pinta ningún estado.
   */
  problemas?: string[];
  /** `error` = algo roto (rojo); `pendiente` = nodo a medias (ámbar). Sin dato, un error del servidor es `error`. */
  gravedad?: GravedadNodo;
}

/** Nodo custom único para los 9 tipos del flujo: la distinción visual viene del icono, el label y
 *  dos tratamientos con significado (entrada = anillo primario, handoff = borde destructivo) — no
 *  de un color por tipo, que con 9 categorías y una paleta restringida a los tokens del proyecto
 *  saturaría el canvas sin aportar información real.
 *
 *  El estado de cada nodo se dice con icono Y texto, no solo con color: rojo = algo falta (con la
 *  primera causa a la vista), verde = listo. El paso de rojo a verde es inmediato y la marca verde
 *  entra con un «pop» corto, porque es el único momento en que el usuario necesita notar que su
 *  arreglo funcionó. */
export function FlowNode({ data, selected }: NodeProps): React.ReactElement {
  const { nodo, esEntrada, error, problemas, gravedad } = data as FlowNodeData;
  const visual = NODE_VISUALS[nodo.tipo];
  const Icon = visual.icon;
  const esHandoff = nodo.tipo === 'handoff';
  const resumen = resumenConfig(nodo);
  const filas = filasDeRama(nodo);
  const titulo = nombreDeNodo(nodo);
  const tieneNombre = titulo !== visual.label;

  const detalles = [...(error ? [error] : []), ...(problemas ?? [])];
  const conError = detalles.length > 0;
  const listo = !conError && problemas !== undefined;
  const nivel: GravedadNodo = error ? 'error' : (gravedad ?? 'error');

  return (
    <div
      className={cn(
        'w-60 rounded-lg border bg-card shadow-sm transition-[box-shadow,border-color] duration-150 ease-out',
        selected ? 'ring-2 ring-ring' : '',
        esEntrada && 'ring-2 ring-primary',
        esHandoff ? 'border-destructive/50' : 'border-border',
        // Borde fino y del color del estado: el detalle vive en el popover del icono, no en el nodo.
        conError && (nivel === 'error' ? 'border-destructive/70' : 'border-amber-500/60'),
      )}
    >
      {!esEntrada ? (
        <Handle type="target" position={Position.Top} className="!bg-muted-foreground/60" />
      ) : null}

      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            esHandoff
              ? 'bg-destructive-subtle text-destructive'
              : visual.destacado
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={titulo}>
          {titulo}
          {tieneNombre ? (
            <span className="ml-1.5 font-normal text-muted-foreground">· {visual.label}</span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {esEntrada ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Inicio
            </span>
          ) : null}
          {conError ? (
            <ProblemaNodo gravedad={nivel} problemas={detalles} />
          ) : listo ? (
            <CheckCircle2
              className="h-3.5 w-3.5 text-success motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
              role="img"
              aria-label="Listo"
            />
          ) : null}
        </div>
      </div>

      {filas.length > 0 ? (
        // Una fila por rama, cada una con su propio handle de salida (a la derecha, alineado a esa
        // fila) — es lo que hace arrastrable en el canvas lo que antes solo vivía en el `<Select>`
        // del inspector. `relative` en la fila es lo que ancla el handle absoluto a SU posición,
        // no a la del nodo completo.
        <ul className="divide-y divide-border/60">
          {filas.map((fila) => (
            <li key={fila.handleId} className="relative py-1.5 pl-3 pr-5">
              <span className="block truncate text-[11px] text-muted-foreground" title={fila.label}>
                {fila.label}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={fila.handleId}
                className="!bg-primary"
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-3 py-2">
          <p className="line-clamp-2 text-xs text-muted-foreground">{resumen}</p>
        </div>
      )}

      {tieneSalidaLineal(nodo.tipo) ? (
        <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground/60" />
      ) : null}
    </div>
  );
}

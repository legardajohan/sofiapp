import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_VISUALS, filasDeRama, resumenConfig, tieneSalidaLineal } from '../nodeVisuals.js';
import type { INodo } from '../../types.js';

export interface FlowNodeData extends Record<string, unknown> {
  nodo: INodo;
  esEntrada: boolean;
  error?: string;
}

/** Nodo custom único para los 8 tipos del flujo: la distinción visual viene del icono, el label y
 *  dos tratamientos con significado (entrada = anillo primario, handoff = borde destructivo) — no
 *  de un color por tipo, que con 8 categorías y una paleta restringida a los tokens del proyecto
 *  saturaría el canvas sin aportar información real. */
export function FlowNode({ data, selected }: NodeProps): React.ReactElement {
  const { nodo, esEntrada, error } = data as FlowNodeData;
  const visual = NODE_VISUALS[nodo.tipo];
  const Icon = visual.icon;
  const esHandoff = nodo.tipo === 'handoff';
  const resumen = resumenConfig(nodo);
  const filas = filasDeRama(nodo);

  return (
    <div
      className={cn(
        'w-64 rounded-lg border bg-card shadow-sm transition-shadow',
        selected ? 'ring-2 ring-ring' : '',
        esEntrada && 'ring-2 ring-primary',
        esHandoff ? 'border-destructive/50' : 'border-border',
        error && 'border-destructive ring-2 ring-destructive/60',
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
        <span className="truncate text-xs font-medium text-foreground">{visual.label}</span>
        {esEntrada ? (
          <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Inicio
          </span>
        ) : null}
        {error ? <AlertCircle className="ml-auto h-3.5 w-3.5 shrink-0 text-destructive" /> : null}
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

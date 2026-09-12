import { useDroppable } from '@dnd-kit/core';
import { useTheme } from '@/components/theme/ThemeProvider';
import { tagColors } from '@/features/tags/lib/tag-color';
import { cn } from '@/lib/utils';
import type { LeadListItemDTO } from '../../leads/types.js';
import { PipelineCard } from './PipelineCard.js';
import type { PipelineColumnDTO } from '../types.js';

interface Props {
  columna: PipelineColumnDTO;
  onSelect: (lead: LeadListItemDTO) => void;
  /** Abre la tabla filtrada por esta etapa, para recorrer lo que la columna no muestra. */
  onVerEnTabla: (estadoKey: string) => void;
}

/**
 * Una etapa del embudo con sus oportunidades.
 *
 * **El color de la etapa es la firma de la columna.** Es dato del tenant, así que va por `style` y
 * pasa por `tagColors`, el mismo motor de contraste que usan la tabla y los chips de etiqueta: un
 * hex desafortunado sigue siendo legible en claro y en oscuro. Antes vivía en un riel de 2px que
 * apenas se veía; ahora tiñe la cabecera entera, que es lo que permite reconocer una etapa sin
 * leerla. Es el único color cromático del tablero: todo lo demás son tokens semánticos.
 */
export function PipelineColumn({ columna, onSelect, onVerEnTabla }: Props): React.ReactElement {
  const { etapa, leads, total } = columna;
  const { resolvedTheme } = useTheme();
  const { setNodeRef, isOver } = useDroppable({ id: etapa.key });

  const chip = tagColors(etapa.color, resolvedTheme === 'dark' ? 'dark' : 'light');
  const ocultos = total - leads.length;

  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${etapa.label}, ${total} ${total === 1 ? 'oportunidad' : 'oportunidades'}`}
      className={cn(
        'flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/40',
        // Solo las propiedades que cambian al pasar por encima con una tarjeta: `transition-all`
        // arrastraría también el layout de las tarjetas que entran y salen.
        'transition-[background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
        isOver ? 'border-primary/60 bg-primary/5 shadow-md' : 'border-border',
      )}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5"
        style={{ backgroundColor: chip.bg, borderColor: chip.border }}
      >
        <span
          aria-hidden="true"
          // El anillo salva al punto cuando el hex del tenant se parece al fondo teñido de la
          // cabecera: un amarillo claro en tema claro, un azul oscuro en tema oscuro.
          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/15 dark:ring-white/25"
          style={{ backgroundColor: etapa.color }}
        />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: chip.fg }}>
          {etapa.label}
        </h3>

        {etapa.esSalida && (
          // Sentence case, no versalitas: una etiqueta en mayúsculas a 10px pesa más de lo que
          // informa. Dice qué es la etapa, no bloquea nada (el movimiento sigue siendo libre).
          <span
            className="shrink-0 rounded border px-1.5 py-px text-[11px] font-medium opacity-80"
            style={{ color: chip.fg, borderColor: chip.border }}
            title="Etapa de salida: aquí termina el recorrido"
          >
            Salida
          </span>
        )}

        <span
          className="shrink-0 text-sm font-semibold tabular-nums opacity-90"
          style={{ color: chip.fg }}
        >
          {total}
        </span>
      </header>

      {/* Scroller nativo, no `ScrollArea` de shadcn, a propósito: el auto-scroll de dnd-kit busca
          ancestros con `overflow` real, y el viewport de Radix le queda fuera. En una superficie de
          arrastre, poder desplazar la columna mientras se sostiene una tarjeta gana al componente. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {/* Dónde va a aterrizar. Sin esta marca, soltar sobre una columna con tarjetas es un acto
            de fe: el tablero se ilumina entero pero no dice en qué punto entra la oportunidad. */}
        {isOver && (
          <div
            aria-hidden="true"
            className="h-16 shrink-0 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5"
          />
        )}

        {leads.length === 0 ? (
          <p className="px-1 py-8 text-center text-xs text-muted-foreground">
            {isOver ? 'Suelta aquí para mover la oportunidad' : 'Sin oportunidades en esta etapa'}
          </p>
        ) : (
          leads.map((lead) => <PipelineCard key={lead.id} lead={lead} onSelect={onSelect} />)
        )}
      </div>

      {ocultos > 0 && (
        // El tablero no pagina dentro de la columna: recorrer 137 leads es trabajo de la tabla, que
        // ya lo hace bien. Lo que sí debe hacer es decir que no lo muestra todo, y llevar allí.
        <footer className="shrink-0 border-t border-border bg-card/40 px-3 py-2">
          <button
            type="button"
            onClick={() => onVerEnTabla(etapa.key)}
            className="text-xs text-muted-foreground underline-offset-2 transition-colors duration-150 ease-out hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {leads.length} de {total} · Ver en tabla
          </button>
        </footer>
      )}
    </section>
  );
}

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
 * El color de la etapa es **dato del tenant**, así que va por `style` y pasa por `tagColors`, el
 * mismo motor de contraste que usan la tabla y los chips de etiqueta: un hex desafortunado sigue
 * siendo legible en claro y en oscuro.
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
        'flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/30',
        // Solo las dos propiedades que cambian al pasar por encima con una tarjeta: `transition-all`
        // arrastraría también el layout de las tarjetas que entran y salen.
        'transition-[background-color,border-color] duration-150 ease-out',
        isOver ? 'border-primary/50 bg-primary/5' : 'border-border',
      )}
    >
      {/* El riel de color es la firma de la columna: identifica la etapa sin gritar, y deja el
          resto de la cabecera en tokens semánticos. */}
      <div aria-hidden="true" className="h-0.5 w-full" style={{ backgroundColor: etapa.color }} />

      <header className="flex items-center gap-2 px-3 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {etapa.label}
        </h3>
        {etapa.esSalida && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            Salida
          </span>
        )}
        <span
          className="shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums"
          style={{ backgroundColor: chip.bg, color: chip.fg, borderColor: chip.border }}
        >
          {total}
        </span>
      </header>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {leads.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {isOver ? 'Suelta aquí para mover la oportunidad' : 'Sin oportunidades en esta etapa'}
          </p>
        ) : (
          leads.map((lead) => <PipelineCard key={lead.id} lead={lead} onSelect={onSelect} />)
        )}
      </div>

      {ocultos > 0 && (
        // El tablero no pagina dentro de la columna: recorrer 137 leads es trabajo de la tabla, que
        // ya lo hace bien. Lo que sí debe hacer es decir que no lo muestra todo, y llevar allí.
        <footer className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => onVerEnTabla(etapa.key)}
            className="text-xs text-muted-foreground underline-offset-2 transition-colors duration-150 ease-out hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {leads.length} de {total} · Ver en tabla
          </button>
        </footer>
      )}
    </section>
  );
}

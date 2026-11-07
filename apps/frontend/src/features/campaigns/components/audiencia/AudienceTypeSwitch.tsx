import { ListFilter, MessagesSquare } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { TipoAudiencia } from '../../types.js';

interface Props {
  valor: TipoAudiencia;
  onChange: (tipo: TipoAudiencia) => void;
}

const OPCIONES: Array<{ valor: TipoAudiencia; titulo: string; icono: typeof ListFilter }> = [
  { valor: 'segmento', titulo: 'Por filtros', icono: ListFilter },
  { valor: 'mensajes_recientes', titulo: 'Mensajes recientes', icono: MessagesSquare },
];

/**
 * Cómo se arma la audiencia (HU-MARK-07): por filtros de contacto o por a quién se le escribió
 * hace poco. Es una elección entre dos formas de pensar la campaña, no un filtro más; por eso va
 * arriba, como control segmentado, y no mezclada con los criterios.
 *
 * Sin animación al cambiar: se alterna para comparar, y una transición ahí sería espera.
 */
export function AudienceTypeSwitch({ valor, onChange }: Props): React.ReactElement {
  return (
    <ToggleGroup
      type="single"
      value={valor}
      // Radix permite "deseleccionar" el activo con un clic y devolver ''. Aquí siempre hay uno.
      onValueChange={(v) => {
        if (v) onChange(v as TipoAudiencia);
      }}
      aria-label="Cómo eliges a quién le escribes"
      className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1 sm:w-auto"
    >
      {OPCIONES.map(({ valor: v, titulo, icono: Icono }) => (
        <ToggleGroupItem
          key={v}
          value={v}
          className="h-8 flex-1 gap-2 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm sm:flex-none"
        >
          <Icono aria-hidden className="h-4 w-4" />
          {titulo}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

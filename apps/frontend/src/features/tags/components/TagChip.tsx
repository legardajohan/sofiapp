import { X } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { cn } from '@/lib/utils';
import { tagColors } from '../lib/tag-color.js';
import type { TagDTO } from '../types.js';

interface Props {
  tag: TagDTO;
  /** Si viene, el chip muestra una X para quitar la etiqueta de la conversación. */
  onRemove?: (() => void) | undefined;
  className?: string;
}

/**
 * ÚNICO punto de la app que pinta un color venido de la base de datos. El resto del sistema usa
 * tokens semánticos; el color de una etiqueta es dato del tenant, así que va por `style` inline
 * (nunca `bg-[#...]`, que sería una utilidad arbitraria de Tailwind). `tagColors` garantiza el
 * contraste, de modo que un hex desafortunado no produce un chip ilegible.
 *
 * Sin animación de entrada a propósito: en la bandeja se ven decenas de chips a la vez y muchas
 * veces al día; animarlos haría la lista pesada sin aportar información.
 */
export function TagChip({ tag, onRemove, className }: Props): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const { bg, fg, border } = tagColors(tag.color, resolvedTheme === 'dark' ? 'dark' : 'light');

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
        className,
      )}
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
    >
      <span className="truncate">{tag.nombre}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar la etiqueta ${tag.nombre}`}
          // Transición, no keyframes: las etiquetas se alternan rápido y una animación
          // interrumpida debe retomar desde donde está, no reiniciarse.
          className="-mr-0.5 shrink-0 rounded-full opacity-70 transition-opacity duration-150 ease-out hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

import { useTheme } from '@/components/theme/ThemeProvider';
import { cn } from '@/lib/utils';
import { tagColors } from '@/features/tags/lib/tag-color';

interface Props {
  label: string;
  color: string;
  /** Marca la opción retirada del desplegable, que solo sigue viva en fichas ya clasificadas. */
  archivada?: boolean;
  className?: string;
}

/**
 * Una opción de la ficha (interés / objeción / rol) pintada con el color de la empresa.
 *
 * Reutiliza `tagColors` en lugar de aplicar el hex directamente: es el mismo motor que garantiza el
 * contraste de los chips de etiqueta, así que un "Caliente" en `#FFFF00` sigue siendo legible en
 * claro y en oscuro. Ese cálculo depende del tema activo, de ahí el `useTheme`.
 *
 * Sin animación: en la bandeja se ven muchos de estos a la vez y muchas veces al día — el mismo
 * criterio que ya sigue `TagChip`.
 */
export function OpcionChip({ label, color, archivada, className }: Props): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const { bg, fg, border } = tagColors(color, resolvedTheme === 'dark' ? 'dark' : 'light');

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[11px] font-medium leading-tight',
        className,
      )}
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
    >
      <span className="truncate">{label}</span>
      {archivada && <span className="shrink-0 opacity-70">(archivada)</span>}
    </span>
  );
}

/**
 * Punto de color a secas, para donde ya hay una etiqueta de texto al lado y repetir el chip entero
 * solo añadiría peso. Va con el hex directo —no con `tagColors`— porque un círculo sólido de 10px
 * no lleva texto encima y por tanto no tiene nada que contrastar.
 */
export function PuntoColor({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
      style={{ backgroundColor: color }}
    />
  );
}

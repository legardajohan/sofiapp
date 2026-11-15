import { RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

interface Props {
  id: string;
  valor: string;
  activa: boolean;
  deshabilitada?: boolean;
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  /** Control extra que solo aparece con la opción elegida (p. ej. el selector de destino). */
  children?: React.ReactNode;
}

/**
 * Opción de un `RadioGroup` con título, explicación y un control anidado. Se usa donde la elección
 * tiene consecuencias que hay que leer antes de confirmar: el rol de un usuario y qué pasa con sus
 * conversaciones o su equipo. Debe ir dentro de un `RadioGroup`.
 */
export function OpcionCard({
  id,
  valor,
  activa,
  deshabilitada = false,
  icono,
  titulo,
  detalle,
  children,
}: Props): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-3 transition-[border-color,background-color] duration-150 ease-out',
        activa ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border bg-card',
        deshabilitada ? 'opacity-60' : !activa && 'hover:border-foreground/25',
      )}
    >
      <label
        htmlFor={id}
        className={cn('flex items-start gap-3', deshabilitada ? 'cursor-not-allowed' : 'cursor-pointer')}
      >
        <RadioGroupItem id={id} value={valor} disabled={deshabilitada} className="mt-0.5" />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="text-muted-foreground" aria-hidden>
              {icono}
            </span>
            {titulo}
          </span>
          <span className="block text-sm text-muted-foreground">{detalle}</span>
        </span>
      </label>
      {children && <div className="pl-7">{children}</div>}
    </div>
  );
}

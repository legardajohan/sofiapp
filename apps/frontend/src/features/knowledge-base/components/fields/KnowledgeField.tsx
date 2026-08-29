import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { KbRequirement } from '../../lib/kb-schemas.js';

/** A partir del 90 % del tope el contador avisa; en el tope, bloquea visualmente. */
const UMBRAL_AVISO = 0.9;

interface FieldCounterProps {
  length: number;
  max: number;
  /** `id` para enlazarlo con `aria-describedby` desde el control. */
  id?: string;
}

/**
 * Contador de caracteres. Vive aquí y no en cada formulario para que el contador **global** del
 * modal y los de cada campo no puedan divergir en umbrales ni en color: son el mismo componente.
 */
export function FieldCounter({ length, max, id }: FieldCounterProps): React.ReactElement {
  const color =
    length >= max
      ? 'text-destructive font-medium'
      : length >= max * UMBRAL_AVISO
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';

  return (
    <span id={id} className={cn('text-xs tabular-nums', color)} aria-live="polite">
      {length.toLocaleString('es-CO')} / {max.toLocaleString('es-CO')}
    </span>
  );
}

/**
 * Marcador de exigencia. Es información, no decoración: le dice al admin si puede saltarse el campo.
 * `condicional` se explica en palabras («Obligatorio si aplica») porque el nombre del tipo no
 * significa nada fuera del código.
 */
const ETIQUETA_REQUISITO: Readonly<Record<KbRequirement, string>> = {
  obligatorio: 'Obligatorio',
  opcional: 'Opcional',
  condicional: 'Obligatorio si aplica',
};

interface KnowledgeFieldProps {
  /** `id` del control que envuelve, para que la etiqueta lo enfoque al hacer clic. */
  htmlFor: string;
  etiqueta: string;
  requisito: KbRequirement;
  ayuda?: string;
  /** Longitud actual. Omitir en campos sin texto (un horario o un tri-estado no se cuentan). */
  length?: number;
  maxLength?: number;
  /** Mensaje de error del campo. Su presencia también tiñe el marcador de exigencia. */
  error?: string;
  children: React.ReactNode;
}

/**
 * Envoltura de un campo del formulario guiado: etiqueta, marcador de exigencia, contador, ayuda y
 * hueco de error. El control en sí lo pone quien la usa — así el mismo marco sirve para un `Input`,
 * un `Textarea`, una lista repetible o un editor de horarios.
 */
export function KnowledgeField({
  htmlFor,
  etiqueta,
  requisito,
  ayuda,
  length,
  maxLength,
  error,
  children,
}: KnowledgeFieldProps): React.ReactElement {
  const contador = length !== undefined && maxLength !== undefined;
  const idAyuda = ayuda ? `${htmlFor}-ayuda` : undefined;
  const idError = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor} className="leading-snug">
          {etiqueta}{' '}
          <span
            className={cn(
              'text-xs font-normal',
              error ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            · {ETIQUETA_REQUISITO[requisito]}
          </span>
        </Label>
        {contador && <FieldCounter length={length} max={maxLength} />}
      </div>

      {ayuda && (
        <p id={idAyuda} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      )}

      <div aria-describedby={cn(idAyuda, idError) || undefined}>{children}</div>

      {error && (
        <p id={idError} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

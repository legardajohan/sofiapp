import { useId } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { CombinacionSegmento } from '../../types.js';

interface Props {
  valor: CombinacionSegmento;
  onChange: (valor: CombinacionSegmento) => void;
}

const OPCIONES: Array<{ valor: CombinacionSegmento; titulo: string; detalle: string }> = [
  {
    valor: 'y',
    titulo: 'Cumplen las dos',
    detalle: 'Están en una de esas etapas y además llevan una de esas etiquetas.',
  },
  {
    valor: 'o',
    titulo: 'Cumplen cualquiera',
    detalle: 'Basta con estar en la etapa o llevar la etiqueta. Nadie se cuenta dos veces.',
  },
];

/**
 * Cómo se juntan etapas y etiquetas. Solo aparece cuando hay de las dos: con una sola no hay nada
 * que combinar, y enseñarlo antes sería una pregunta sin sentido.
 *
 * Radios y no un interruptor: las dos opciones son igual de legítimas, y cada una necesita su frase
 * para que la diferencia entre «y» y «o» no dependa de saber lógica booleana.
 */
export function CombinacionSelector({ valor, onChange }: Props): React.ReactElement {
  const id = useId();

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">¿Cómo se combinan?</legend>
      <RadioGroup
        value={valor}
        onValueChange={(v) => onChange(v as CombinacionSegmento)}
        className="grid gap-2 sm:grid-cols-2"
      >
        {OPCIONES.map((o) => (
          <label
            key={o.valor}
            htmlFor={`${id}-${o.valor}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5',
              'transition-[border-color,background-color,transform] duration-150 ease-out motion-safe:active:scale-[0.98]',
              valor === o.valor
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-border bg-card hover:border-foreground/25',
            )}
          >
            <RadioGroupItem id={`${id}-${o.valor}`} value={o.valor} className="mt-0.5" />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-foreground">{o.titulo}</span>
              <span className="block text-sm text-muted-foreground">{o.detalle}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

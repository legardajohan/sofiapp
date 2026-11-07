import { AlertTriangle, Info } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { FranjasSemanaEditor } from './FranjasSemanaEditor.js';
import { resumenFranjas } from '../lib/resumen.js';
import type { FranjasPorDia } from '../lib/validacion.js';
import {
  CATEGORIA_INFO,
  type CategoriaEnvio,
  type Franja,
  type ModoRegla,
} from '../types.js';

interface Props {
  categoria: CategoriaEnvio;
  modo: ModoRegla;
  dias: FranjasPorDia;
  /** Las mismas franjas en la forma del API: alimentan el resumen de la cabecera. */
  franjas: Franja[];
  errores: string[];
  onModo: (modo: ModoRegla) => void;
  onDias: (dias: FranjasPorDia) => void;
}

export function CategoriaReglaCard({
  categoria,
  modo,
  dias,
  franjas,
  errores,
  onModo,
  onDias,
}: Props): React.ReactElement {
  const info = CATEGORIA_INFO[categoria];
  const id = `regla-${categoria}`;
  const sinFranjas = modo === 'restringido' && franjas.length === 0;

  return (
    <AccordionItem
      value={categoria}
      className="rounded-xl border border-border bg-card px-5 shadow-card"
    >
      <AccordionTrigger className="gap-4 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {info.nombre}
            {errores.length > 0 || sinFranjas ? (
              <AlertTriangle
                className={cn('size-3.5', errores.length > 0 ? 'text-destructive' : 'text-muted-foreground')}
                aria-label={errores.length > 0 ? 'Tiene errores' : 'Revisa este horario'}
              />
            ) : null}
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-sm font-normal tabular-nums',
              modo === 'libre' ? 'text-muted-foreground' : 'text-secondary-foreground',
            )}
          >
            {resumenFranjas(modo, franjas)}
          </span>
        </span>
      </AccordionTrigger>

      <AccordionContent className="space-y-5 pb-5">
        <p className="max-w-prose text-sm text-muted-foreground">{info.descripcion}</p>

        <RadioGroup
          value={modo}
          onValueChange={(v) => onModo(v as ModoRegla)}
          className="grid gap-2 sm:grid-cols-2"
          aria-label={`Cuándo se envían: ${info.nombre}`}
        >
          {(
            [
              ['libre', 'A cualquier hora', 'Esta categoría no tiene restricción horaria.'],
              ['restringido', 'Solo en un horario', 'Sale únicamente dentro de las franjas de abajo.'],
            ] as const
          ).map(([valor, titulo, ayuda]) => (
            <Label
              key={valor}
              htmlFor={`${id}-${valor}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors',
                modo === valor ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
            >
              <RadioGroupItem id={`${id}-${valor}`} value={valor} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-foreground">{titulo}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{ayuda}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        {modo === 'restringido' ? (
          <FranjasSemanaEditor idBase={id} dias={dias} onChange={onDias} />
        ) : null}

        {sinFranjas ? (
          <p className="flex items-start gap-2 text-sm text-secondary-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Sin ninguna franja, estos mensajes no saldrán nunca salvo en las fechas especiales que
            abras abajo.
          </p>
        ) : null}

        {errores.length > 0 ? (
          <ul className="space-y-1" role="alert">
            {errores.map((e) => (
              <li key={e} className="text-sm text-destructive">
                {e}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-secondary-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {info.fueraDeFranja}
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}

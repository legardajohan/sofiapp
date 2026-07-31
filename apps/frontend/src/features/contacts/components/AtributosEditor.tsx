import { Lock, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { MOTIVO_DATOS_SENSIBLES } from '@/lib/roles';
import type { AtributoInput } from '../types.js';

interface Props {
  atributos: AtributoInput[];
  onChange: (atributos: AtributoInput[]) => void;
  /** Sin permiso, las filas sensibles se ven pero no se tocan. */
  puedeEditarSensibles: boolean;
  disabled: boolean;
}

const MAX_ATRIBUTOS = 30;

const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

export function AtributosEditor({
  atributos,
  onChange,
  puedeEditarSensibles,
  disabled,
}: Props): React.ReactElement {
  function actualizar(indice: number, cambios: Partial<AtributoInput>): void {
    onChange(atributos.map((a, i) => (i === indice ? { ...a, ...cambios } : a)));
  }

  function agregar(): void {
    onChange([...atributos, { key: '', label: '', valor: '', sensible: false }]);
  }

  function quitar(indice: number): void {
    onChange(atributos.filter((_, i) => i !== indice));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label>Atributos personalizados</Label>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {atributos.length} / {MAX_ATRIBUTOS}
        </span>
      </div>

      {atributos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          Guarda aquí lo que no cabe en los campos fijos: colegio, grado, EPS, presupuesto. Marca
          como sensible lo que solo deba ver Dirección.
        </p>
      ) : (
        <ul className="space-y-2">
          {atributos.map((atributo, i) => {
            // Una fila sensible preexistente queda intacta para quien no puede tocarla.
            const bloqueada = atributo.sensible && !puedeEditarSensibles;
            return (
              <li
                key={atributo.key || `nuevo-${i}`}
                className="space-y-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Nombre del atributo ${i + 1}`}
                    placeholder="Colegio"
                    className="h-8 flex-1 text-xs"
                    value={atributo.label}
                    disabled={disabled || bloqueada}
                    maxLength={60}
                    // La clave NO se deriva aquí: al teclear letra a letra saldría de la primera
                    // ("Colegio" → `c`). Se asigna al guardar, con la etiqueta ya completa.
                    onChange={(e) => actualizar(i, { label: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8 shrink-0 text-muted-foreground', pressable)}
                    aria-label={`Quitar el atributo ${atributo.label || i + 1}`}
                    disabled={disabled || bloqueada}
                    onClick={() => quitar(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Input
                  aria-label={`Valor del atributo ${atributo.label || i + 1}`}
                  placeholder="San José"
                  className="h-8 text-xs"
                  value={atributo.valor}
                  disabled={disabled || bloqueada}
                  maxLength={500}
                  onChange={(e) => actualizar(i, { valor: e.target.value })}
                />

                <div className="flex items-center gap-2">
                  <Switch
                    id={`sensible-${i}`}
                    checked={atributo.sensible}
                    disabled={disabled || !puedeEditarSensibles}
                    onCheckedChange={(sensible) => actualizar(i, { sensible })}
                  />
                  <Label
                    htmlFor={`sensible-${i}`}
                    className="flex cursor-pointer items-center gap-1 text-[11px] font-normal text-muted-foreground"
                  >
                    {atributo.sensible && <Lock className="h-3 w-3" aria-hidden="true" />}
                    {atributo.sensible ? 'Sensible: se cifra y se oculta' : 'Marcar como sensible'}
                  </Label>
                </div>

                {bloqueada && (
                  <p className="text-[11px] text-muted-foreground">{MOTIVO_DATOS_SENSIBLES}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('w-full', pressable)}
        disabled={disabled || atributos.length >= MAX_ATRIBUTOS}
        onClick={agregar}
      >
        <Plus className="h-4 w-4" />
        Agregar atributo
      </Button>
    </div>
  );
}

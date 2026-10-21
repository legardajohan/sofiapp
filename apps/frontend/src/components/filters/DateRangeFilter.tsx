import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isoDia } from '@/hooks/use-period-params';

interface Props {
  /** Prefijo de los `id`: dos filtros en la misma página no deben chocar. */
  idPrefix: string;
  /** `YYYY-MM-DD` o `''`. */
  desde: string;
  hasta: string;
  onChange: (campo: 'desde' | 'hasta', valor: string) => void;
  onClear: () => void;
  /** Qué pasa mientras el rango está invertido (se dice en el aviso). */
  mientrasInvertido: string;
}

/**
 * Rango de fechas libre, con cada extremo opcional (HU-REP-05-V2). Mismo control que el modo
 * personalizado de `PeriodFilter` —`Input type="date"` con su `Label`— para que los filtros por
 * fecha de la app se lean igual; aquí sin presets y con un "Limpiar" explícito.
 */
export function DateRangeFilter({
  idPrefix,
  desde,
  hasta,
  onChange,
  onClear,
  mientrasInvertido,
}: Props): React.ReactElement {
  const hoy = isoDia(new Date());
  const invertido = desde !== '' && hasta !== '' && desde > hasta;
  const errorId = `${idPrefix}-rango-error`;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-desde`} className="text-xs text-muted-foreground">
          Desde
        </Label>
        <Input
          id={`${idPrefix}-desde`}
          type="date"
          className="h-8 w-36 text-xs"
          value={desde}
          max={hasta || hoy}
          onChange={(e) => onChange('desde', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-hasta`} className="text-xs text-muted-foreground">
          Hasta
        </Label>
        <Input
          id={`${idPrefix}-hasta`}
          type="date"
          className="h-8 w-36 text-xs"
          value={hasta}
          min={desde || undefined}
          max={hoy}
          aria-invalid={invertido}
          aria-describedby={invertido ? errorId : undefined}
          onChange={(e) => onChange('hasta', e.target.value)}
        />
      </div>
      {(desde !== '' || hasta !== '') && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onClear}>
          <X aria-hidden="true" />
          Limpiar fechas
        </Button>
      )}
      {invertido && (
        <p id={errorId} role="alert" className="basis-full text-xs text-destructive">
          La fecha final es anterior a la inicial. {mientrasInvertido}
        </p>
      )}
    </div>
  );
}

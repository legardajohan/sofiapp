import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isoDia, PERIODO_LABEL, type PeriodParams, type PeriodoPreset } from '@/hooks/use-period-params';

interface Props {
  period: PeriodParams;
  /** Prefijo de los `id` de los campos: dos filtros en la misma página no deben chocar. */
  idPrefix: string;
  /** Qué pasa mientras el rango personalizado está invertido (se dice en el aviso). */
  mientrasInvertido: string;
}

/** Periodo de un reporte: una sola fila encima de todo lo que filtra (dataviz: filtros arriba). */
export function PeriodFilter({ period, idPrefix, mientrasInvertido }: Props): React.ReactElement {
  const { presets, preset, desde, hasta, invertido, setPreset, setFecha } = period;
  const hoy = isoDia(new Date());

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-periodo`} className="text-xs text-muted-foreground">
          Periodo
        </Label>
        <Select value={preset} onValueChange={(v) => setPreset(v as PeriodoPreset)}>
          <SelectTrigger id={`${idPrefix}-periodo`} className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p} value={p}>
                {PERIODO_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === 'personalizado' && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-desde`} className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id={`${idPrefix}-desde`}
              type="date"
              className="w-40"
              value={desde}
              max={hasta || hoy}
              onChange={(e) => setFecha('desde', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-hasta`} className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id={`${idPrefix}-hasta`}
              type="date"
              className="w-40"
              value={hasta}
              min={desde || undefined}
              max={hoy}
              aria-invalid={invertido}
              aria-describedby={invertido ? `${idPrefix}-rango-error` : undefined}
              onChange={(e) => setFecha('hasta', e.target.value)}
            />
          </div>
          {invertido && (
            <p id={`${idPrefix}-rango-error`} role="alert" className="basis-full text-xs text-destructive">
              La fecha final es anterior a la inicial. {mientrasInvertido}
            </p>
          )}
        </>
      )}
    </div>
  );
}

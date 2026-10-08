import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isoDia, type MetricsFilters as Filters, type PeriodoPreset } from '../hooks/useMetricsFilters.js';

const PRESET_LABEL: Record<PeriodoPreset, string> = {
  todo: 'Todo el historial',
  '30d': 'Últimos 30 días',
  mes: 'Este mes',
  personalizado: 'Fechas personalizadas',
};

interface Props {
  filters: Filters;
}

/** Periodo del tablero. Una sola fila encima de todo lo que filtra (dataviz: filtros arriba). */
export function MetricsFilters({ filters }: Props): React.ReactElement {
  const { preset, desde, hasta, setPreset, setFecha } = filters;
  const invertido = preset === 'personalizado' && desde !== '' && hasta !== '' && hasta < desde;
  const hoy = isoDia(new Date());

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="metricas-periodo" className="text-xs text-muted-foreground">
          Periodo
        </Label>
        <Select value={preset} onValueChange={(v) => setPreset(v as PeriodoPreset)}>
          <SelectTrigger id="metricas-periodo" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRESET_LABEL) as PeriodoPreset[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === 'personalizado' && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="metricas-desde" className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id="metricas-desde"
              type="date"
              className="w-40"
              value={desde}
              max={hasta || hoy}
              onChange={(e) => setFecha('desde', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="metricas-hasta" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="metricas-hasta"
              type="date"
              className="w-40"
              value={hasta}
              min={desde || undefined}
              max={hoy}
              aria-invalid={invertido}
              aria-describedby={invertido ? 'metricas-rango-error' : undefined}
              onChange={(e) => setFecha('hasta', e.target.value)}
            />
          </div>
          {invertido && (
            <p id="metricas-rango-error" role="alert" className="basis-full text-xs text-destructive">
              La fecha final es anterior a la inicial. Mostramos todo el historial hasta que lo corrijas.
            </p>
          )}
        </>
      )}
    </div>
  );
}

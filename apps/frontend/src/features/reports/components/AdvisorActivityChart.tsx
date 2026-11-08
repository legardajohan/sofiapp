import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { formatDuracion } from '../lib/duracion-format.js';
import type { AdvisorActivity, Granularidad } from '../types/index.js';

interface Props {
  actividad: AdvisorActivity | undefined;
  isLoading: boolean;
  granularidad: Granularidad;
  onGranularidad: (g: Granularidad) => void;
  /** `''` = todos. */
  asesorId: string;
  onAsesor: (id: string) => void;
}

/** Las cinco series de `--chart-1…5` (validadas para daltonismo en light y dark). El resto, a «Otros». */
const COLORES = [1, 2, 3, 4, 5].map((n) => `hsl(var(--chart-${n}))`);
const COLOR_OTROS = 'hsl(var(--muted-foreground) / 0.45)';
const TODOS = 'todos';

const GRANULARIDAD_LABEL: Record<Granularidad, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes' };

const DESCRIPCION: Record<Granularidad, string> = {
  dia: 'Horas con SofiApp abierto y en uso, por día',
  semana: 'Horas con SofiApp abierto y en uso, por semana (de lunes a domingo)',
  mes: 'Horas con SofiApp abierto y en uso, por mes',
};

// Los periodos son días calendario ya resueltos en la zona del visor: se leen en UTC para no correrlos.
const fmtDia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function etiquetaEje(periodo: string, g: Granularidad): string {
  const fecha = new Date(`${periodo}T00:00:00Z`);
  return g === 'mes' ? fmtMes.format(fecha) : fmtDia.format(fecha);
}

function etiquetaTooltip(periodo: string, g: Granularidad): string {
  const fecha = new Date(`${periodo}T00:00:00Z`);
  if (g === 'semana') return `Semana del ${fmtDia.format(fecha)}`;
  return g === 'mes' ? fmtMes.format(fecha) : fmtDia.format(fecha);
}

interface Serie {
  key: string;
  label: string;
  color: string;
  ids: string[];
}

/**
 * Series de la gráfica. El color sigue al asesor, no al filtro: se asigna sobre la lista completa
 * (ordenada por tiempo total) y elegir a un asesor solo oculta a los demás, sin repintarlo.
 */
function construirSeries(actividad: AdvisorActivity, asesorId: string): Serie[] {
  const todas: Serie[] = actividad.asesores.slice(0, COLORES.length).map((a, i) => ({
    key: `a${i}`,
    label: a.nombre,
    color: COLORES[i] as string,
    ids: [a.asesorId],
  }));
  const resto = actividad.asesores.slice(COLORES.length);
  if (resto.length > 0) {
    todas.push({ key: 'otros', label: `Otros (${resto.length})`, color: COLOR_OTROS, ids: resto.map((a) => a.asesorId) });
  }
  if (!asesorId) return todas;

  const elegida = todas.find((s) => s.ids.includes(asesorId));
  if (!elegida) return [];
  const nombre = actividad.asesores.find((a) => a.asesorId === asesorId)?.nombre ?? elegida.label;
  return [{ ...elegida, key: elegida.key, label: nombre, ids: [asesorId] }];
}

/**
 * Tiempo activo por periodo (HU-REP-06): barras apiladas por asesor en horas. Un solo eje: todo es
 * tiempo. Con un asesor elegido queda una serie sola, sin leyenda (el título y el selector la nombran).
 */
export function AdvisorActivityChart({
  actividad,
  isLoading,
  granularidad,
  onGranularidad,
  asesorId,
  onAsesor,
}: Props): React.ReactElement {
  const series = useMemo(() => (actividad ? construirSeries(actividad, asesorId) : []), [actividad, asesorId]);

  const datos = useMemo(
    () =>
      (actividad?.periodos ?? []).map((p) => {
        const fila: Record<string, string | number> = { periodo: p.periodo };
        for (const s of series) {
          const segundos = p.porAsesor.filter((f) => s.ids.includes(f.asesorId)).reduce((t, f) => t + f.segundos, 0);
          fila[s.key] = segundos / 3600;
        }
        return fila;
      }),
    [actividad, series],
  );

  const config = useMemo(
    () => Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig,
    [series],
  );

  const hayDatos = datos.some((d) => series.some((s) => Number(d[s.key]) > 0));
  const varias = series.length > 1;
  const ultima = series[series.length - 1]?.key;

  return (
    <ChartCard
      title="Tiempo activo"
      description={DESCRIPCION[granularidad]}
      isLoading={isLoading}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={asesorId || TODOS} onValueChange={(v) => onAsesor(v === TODOS ? '' : v)}>
            <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Asesor">
              <SelectValue placeholder="Todos los asesores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los asesores</SelectItem>
              {(actividad?.asesores ?? []).map((a) => (
                <SelectItem key={a.asesorId} value={a.asesorId}>
                  {a.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={granularidad} onValueChange={(v) => onGranularidad(v as Granularidad)}>
            <TabsList className="h-8">
              {(Object.keys(GRANULARIDAD_LABEL) as Granularidad[]).map((g) => (
                <TabsTrigger key={g} value={g} className="text-xs">
                  {GRANULARIDAD_LABEL[g]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      }
    >
      {!hayDatos ? (
        <ChartEmpty>
          {asesorId
            ? 'Este asesor no tiene tiempo activo en el periodo.'
            : 'Todavía no hay tiempo activo en este periodo. El registro empezó con esta versión de SofiApp, así que los días anteriores aparecen vacíos.'}
        </ChartEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
          <BarChart data={datos} margin={{ top: 12, left: 0, right: 8 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="periodo"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
              tickFormatter={(v: string) => etiquetaEje(v, granularidad)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(v: number) => `${v} h`}
            />
            <ChartTooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const periodo = payload?.[0]?.payload?.periodo as string | undefined;
                    return periodo ? etiquetaTooltip(periodo, granularidad) : '';
                  }}
                  formatter={(value, name, item) => (
                    <span className="flex w-full items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                        {config[String(name)]?.label ?? name}
                      </span>
                      <span className="font-medium tabular-nums text-foreground">
                        {formatDuracion(Number(value) * 3600)}
                      </span>
                    </span>
                  )}
                />
              }
            />
            {varias && <ChartLegend content={<ChartLegendContent />} />}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="tiempo"
                fill={`var(--color-${s.key})`}
                // Separador de 2px del color de la tarjeta entre segmentos apilados.
                stroke="hsl(var(--card))"
                strokeWidth={varias ? 2 : 0}
                radius={s.key === ultima ? [4, 4, 0, 0] : 0}
                maxBarSize={48}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

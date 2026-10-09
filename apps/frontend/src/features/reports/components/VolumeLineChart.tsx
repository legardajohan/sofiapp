import { CartesianGrid, Line, LineChart, ReferenceDot, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatEntero } from '@/lib/format';

export interface VolumePoint {
  /** Valor del eje X, único por punto. */
  clave: string;
  entrantes: number;
  salientes: number;
}

interface Props {
  puntos: VolumePoint[];
  /** `clave` del punto pico (más recibidos), o `null`. */
  pico: string | null;
  formatTick: (clave: string) => string;
  formatTitulo: (clave: string) => string;
  /** Cada cuántos ticks se rotula el eje X (Recharts `interval`). */
  intervalo?: number | 'preserveStartEnd';
}

// Las dos series miden lo mismo (mensajes): comparten un único eje Y. Recibidos, la demanda, va en
// el azul de "volumen" del resto de reportes.
const config = {
  entrantes: { label: 'Recibidos', color: 'hsl(var(--chart-1))' },
  salientes: { label: 'Enviados', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const SERIES = ['entrantes', 'salientes'] as const;

/** Recibidos vs enviados en el tiempo, con el pico de recibidos marcado y rotulado (HU-REP-04). */
export function VolumeLineChart({ puntos, pico, formatTick, formatTitulo, intervalo = 'preserveStartEnd' }: Props): React.ReactElement {
  const puntoPico = pico === null ? undefined : puntos.find((p) => p.clave === pico);

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <LineChart data={puntos} margin={{ top: 24, left: 0, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="clave"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={intervalo}
          minTickGap={12}
          tickFormatter={formatTick}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          allowDecimals={false}
          tickFormatter={(v: number) => formatEntero(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => {
                const clave = (payload[0]?.payload as VolumePoint | undefined)?.clave;
                return clave ? formatTitulo(clave) : '';
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {SERIES.map((key) => (
          <Line
            key={key}
            dataKey={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        ))}
        {puntoPico && (
          <ReferenceDot
            x={puntoPico.clave}
            y={puntoPico.entrantes}
            r={5}
            fill="var(--color-entrantes)"
            stroke="hsl(var(--card))"
            strokeWidth={2}
            label={{
              value: formatEntero(puntoPico.entrantes),
              position: 'top',
              offset: 10,
              className: 'fill-foreground text-xs font-medium tabular-nums',
            }}
          />
        )}
      </LineChart>
    </ChartContainer>
  );
}

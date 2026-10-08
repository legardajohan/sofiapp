import { useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartCard, ChartEmpty } from './ChartCard.js';
import { formatEntero, formatMesCorto, formatMesLargo } from '../lib/format.js';
import type { MonthlyPoint } from '../types/index.js';

interface Props {
  serie: MonthlyPoint[] | undefined;
  isLoading: boolean;
}

type Vista = 'conversaciones' | 'embudo';

// Conversaciones va sola: su escala aplasta a leads y ventas, y un segundo eje Y engañaría.
// Leads y ventas sí comparten eje (misma magnitud, la distancia entre líneas ES la conversión).
const config = {
  conversaciones: { label: 'Conversaciones', color: 'hsl(var(--chart-3))' },
  leads: { label: 'Leads', color: 'hsl(var(--chart-1))' },
  ventas: { label: 'Ventas', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const SERIES: Record<Vista, Array<keyof typeof config>> = {
  conversaciones: ['conversaciones'],
  embudo: ['leads', 'ventas'],
};

export function MonthlyTrendChart({ serie, isLoading }: Props): React.ReactElement {
  const [vista, setVista] = useState<Vista>('embudo');
  const vacia = !serie || serie.every((p) => p.conversaciones === 0 && p.leads === 0);
  const series = SERIES[vista];

  return (
    <ChartCard
      title="Últimos 6 meses"
      description="Lo que entra cada mes en toda la plataforma"
      isLoading={isLoading}
      action={
        <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)}>
          <TabsList className="h-8">
            <TabsTrigger value="embudo" className="text-xs">Leads y ventas</TabsTrigger>
            <TabsTrigger value="conversaciones" className="text-xs">Conversaciones</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {vacia ? (
        <ChartEmpty>Sin actividad en los últimos 6 meses.</ChartEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <LineChart data={serie} margin={{ top: 8, left: 0, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="periodo" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatMesCorto} />
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
                    const periodo = (payload[0]?.payload as MonthlyPoint | undefined)?.periodo;
                    return periodo ? formatMesLargo(periodo) : '';
                  }}
                />
              }
            />
            {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {series.map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--card))' }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

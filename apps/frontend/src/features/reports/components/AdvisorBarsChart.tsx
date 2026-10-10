import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { AdvisorRow } from '../types/index.js';

interface Props {
  asesores: AdvisorRow[] | undefined;
  isLoading: boolean;
}

type Vista = 'comparar' | 'tasa';

/** Con más asesores que esto, las barras van horizontales: los nombres no caben bajo el eje X. */
const MAX_VERTICAL = 8;
const ALTO_FILA = 44;

// Atendidas en azul y Ventas en naranja: los mismos colores que Leads/Ventas en el tablero global.
const config = {
  conversacionesAtendidas: { label: 'Atendidas', color: 'hsl(var(--chart-1))' },
  ventas: { label: 'Ventas', color: 'hsl(var(--chart-2))' },
  tasaCierre: { label: 'Tasa de cierre', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const recortar = (v: string): string => (v.length > 16 ? `${v.slice(0, 15)}…` : v);

/**
 * Productividad por asesor. "Comparar" pone atendidas y ventas lado a lado en UN eje (misma unidad:
 * conteos); "Tasa de cierre" es otra unidad, así que va en su propia vista, no en un segundo eje.
 */
export function AdvisorBarsChart({ asesores, isLoading }: Props): React.ReactElement {
  const [vista, setVista] = useState<Vista>('comparar');
  const filas = (asesores ?? []).filter((a) => a.conversacionesAtendidas > 0 || a.ventas > 0);
  const horizontal = filas.length > MAX_VERTICAL;
  const alto = horizontal ? Math.max(filas.length * ALTO_FILA + 48, 240) : 280;

  return (
    <ChartCard
      title="Por asesor"
      description={
        vista === 'comparar'
          ? 'Conversaciones atendidas y ventas cerradas en el periodo'
          : 'Ventas cerradas por cada conversación atendida'
      }
      isLoading={isLoading}
      action={
        <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)}>
          <TabsList className="h-8">
            <TabsTrigger value="comparar" className="text-xs">Comparar</TabsTrigger>
            <TabsTrigger value="tasa" className="text-xs">Tasa de cierre</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {filas.length === 0 ? (
        <ChartEmpty>Nadie atendió conversaciones ni cerró ventas en este periodo.</ChartEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: alto }}>
          <BarChart
            data={filas}
            layout={horizontal ? 'vertical' : 'horizontal'}
            margin={horizontal ? { left: 0, right: 48 } : { top: 20, left: 0, right: 8 }}
            barGap={2}
          >
            {horizontal ? (
              <>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nombre" tickLine={false} axisLine={false} width={132} tickFormatter={recortar} />
              </>
            ) : (
              <>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="nombre" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={recortar} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  allowDecimals={false}
                  tickFormatter={(v: number) => (vista === 'tasa' ? formatPorcentaje(v) : formatEntero(v))}
                />
              </>
            )}
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={
                    vista === 'tasa'
                      ? (value) => (
                          <span className="flex w-full justify-between gap-4">
                            <span className="text-muted-foreground">Tasa de cierre</span>
                            <span className="font-medium tabular-nums text-foreground">{formatPorcentaje(Number(value))}</span>
                          </span>
                        )
                      : undefined
                  }
                />
              }
            />
            {vista === 'comparar' ? (
              <>
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="conversacionesAtendidas"
                  fill="var(--color-conversacionesAtendidas)"
                  radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="ventas"
                  fill="var(--color-ventas)"
                  radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={false}
                />
              </>
            ) : (
              <Bar
                dataKey="tasaCierre"
                fill="var(--color-tasaCierre)"
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              >
                {/* Una sola serie: el valor rotulado sobre cada barra hace innecesario el tooltip. */}
                <LabelList
                  dataKey="tasaCierre"
                  position={horizontal ? 'right' : 'top'}
                  offset={8}
                  className="fill-foreground text-xs tabular-nums"
                  formatter={(v: unknown) => formatPorcentaje(Number(v))}
                />
              </Bar>
            )}
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

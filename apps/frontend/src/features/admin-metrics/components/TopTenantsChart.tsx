import { useState } from 'react';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { useGlobalMetrics } from '../hooks/useGlobalMetrics.js';
import { formatEntero } from '../lib/format.js';
import type { GlobalMetricsParams } from '../types/index.js';

interface Props {
  /** Mismo periodo que el resto del tablero. */
  rango: Pick<GlobalMetricsParams, 'desde' | 'hasta'>;
}

type Metrica = 'leads' | 'ventas';

const TOP = 10;
const ALTO_FILA = 30;

// Mismos colores que en la tendencia: Leads es azul y Ventas naranja en todo el tablero.
const config = {
  leads: { label: 'Leads', color: 'hsl(var(--chart-1))' },
  ventas: { label: 'Ventas', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

/** Las 10 empresas con más leads o ventas. Pide su propia página ya ordenada al backend. */
export function TopTenantsChart({ rango }: Props): React.ReactElement {
  const [metrica, setMetrica] = useState<Metrica>('leads');
  const { data, isPending } = useGlobalMetrics({ ...rango, page: 1, limit: TOP, sort: metrica, order: 'desc' });
  const filas = (data?.porEmpresa.items ?? []).filter((f) => f[metrica] > 0);

  return (
    <ChartCard
      title={`Top ${TOP} empresas`}
      description={metrica === 'leads' ? 'Las que más leads generan' : 'Las que más venden'}
      isLoading={isPending}
      action={
        <Tabs value={metrica} onValueChange={(v) => setMetrica(v as Metrica)}>
          <TabsList className="h-8">
            <TabsTrigger value="leads" className="text-xs">Leads</TabsTrigger>
            <TabsTrigger value="ventas" className="text-xs">Ventas</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {filas.length === 0 ? (
        <ChartEmpty>
          {metrica === 'leads' ? 'Ninguna empresa tiene leads en este periodo.' : 'Ninguna empresa registra ventas en este periodo.'}
        </ChartEmpty>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: Math.max(filas.length * ALTO_FILA + 16, 120) }}
        >
          <BarChart data={filas} layout="vertical" margin={{ left: 0, right: 48 }} barCategoryGap={6}>
            <XAxis type="number" dataKey={metrica} hide />
            <YAxis
              type="category"
              dataKey="nombre"
              tickLine={false}
              axisLine={false}
              width={128}
              tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey={metrica} fill={`var(--color-${metrica})`} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList
                dataKey={metrica}
                position="right"
                offset={8}
                className="fill-foreground text-xs tabular-nums"
                formatter={(v: unknown) => formatEntero(Number(v))}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ChartCard, ChartEmpty } from './ChartCard.js';
import { ESTADO_TENANT_LABEL, ESTADOS_TENANT, formatEntero } from '../lib/format.js';
import type { GlobalMetricsConsolidado } from '../types/index.js';

interface Props {
  empresas: GlobalMetricsConsolidado['empresas'] | undefined;
  isLoading: boolean;
}

const config = {
  empresas: { label: 'Empresas', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

/** Una sola serie (magnitud por estado): un solo color, y el número escrito sobre cada barra. */
export function TenantStatusChart({ empresas, isLoading }: Props): React.ReactElement {
  const data = ESTADOS_TENANT.map((e) => ({ estado: ESTADO_TENANT_LABEL[e], empresas: empresas?.porEstado[e] ?? 0 }));

  return (
    <ChartCard title="Empresas por estado" description="Activas, en periodo de prueba y suspendidas" isLoading={isLoading}>
      {!empresas || empresas.total === 0 ? (
        <ChartEmpty>Aún no hay empresas registradas.</ChartEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <BarChart data={data} margin={{ top: 24, left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="estado" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
            <Bar dataKey="empresas" fill="var(--color-empresas)" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
              <LabelList
                dataKey="empresas"
                position="top"
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

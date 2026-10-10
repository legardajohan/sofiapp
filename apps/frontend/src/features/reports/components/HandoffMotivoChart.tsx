import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { MOTIVO_LABEL } from '@/features/handoff/types';
import { formatEntero } from '@/lib/format';
import type { HandoffMotivoRow } from '../types/index.js';

interface Props {
  motivos: HandoffMotivoRow[] | undefined;
  isLoading: boolean;
}

// Una sola serie: todas son transferidas, así que van en el mismo --chart-2 del donut.
const config = {
  conversaciones: { label: 'Conversaciones', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const ALTO_FILA = 44;
const ANCHO_ETIQUETA = 184;

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
}

/**
 * Por qué se transfirieron. Los 5 motivos siempre, en su orden de prioridad (el que fija el
 * producto), para que la lista no baile entre periodos; los que están en 0 se atenúan.
 */
export function HandoffMotivoChart({ motivos, isLoading }: Props): React.ReactElement {
  const filas = (motivos ?? []).map((m) => ({ ...m, etiqueta: MOTIVO_LABEL[m.motivo] }));
  const enCero = new Set(filas.filter((f) => f.conversaciones === 0).map((f) => f.etiqueta));
  const total = filas.reduce((s, f) => s + f.conversaciones, 0);

  const tick = ({ x, y, payload }: TickProps): React.ReactElement => (
    <text
      x={Number(x)}
      y={Number(y)}
      dy={4}
      textAnchor="end"
      className={enCero.has(payload?.value ?? '') ? 'fill-muted-foreground/60 text-xs' : 'fill-foreground text-xs'}
    >
      {payload?.value}
    </text>
  );

  return (
    <ChartCard title="Motivo de la transferencia" description="Qué hizo que Sofi pasara la conversación a un asesor" isLoading={isLoading}>
      {total === 0 ? (
        <ChartEmpty>Sofi no transfirió conversaciones en este periodo.</ChartEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: filas.length * ALTO_FILA + 16 }}>
          <BarChart data={filas} layout="vertical" margin={{ left: 0, right: 40, top: 8, bottom: 8 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="etiqueta" tickLine={false} axisLine={false} width={ANCHO_ETIQUETA} tick={tick} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
            <Bar
              dataKey="conversaciones"
              fill="var(--color-conversaciones)"
              radius={[0, 4, 4, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="conversaciones"
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

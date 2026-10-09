import { Cell, Label, Pie, PieChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { HandoffRate } from '../types/index.js';

interface Props {
  rate: HandoffRate | undefined;
  isLoading: boolean;
}

// Transferidas en --chart-2, el mismo color que sus barras por motivo: la entidad conserva su color.
const config = {
  resueltas: { label: 'Resueltas por Sofi', color: 'hsl(var(--chart-1))' },
  transferidas: { label: 'Transferidas a un asesor', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

type Clave = keyof typeof config;

/** Reparto de las conversaciones con Sofi: una sola unidad (conversaciones), el % al centro. */
export function HandoffDonutChart({ rate, isLoading }: Props): React.ReactElement {
  const total = rate?.conversacionesIa ?? 0;
  const porciones: Array<{ key: Clave; conversaciones: number }> = [
    { key: 'resueltas', conversaciones: rate?.resueltasPorIa ?? 0 },
    { key: 'transferidas', conversaciones: rate?.transferidas ?? 0 },
  ];

  return (
    <ChartCard
      title="Sofi o un asesor"
      description="Cómo terminaron las conversaciones que atendió Sofi"
      isLoading={isLoading}
    >
      {total === 0 ? (
        <ChartEmpty>Sofi no atendió conversaciones en este periodo.</ChartEmpty>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ChartContainer config={config} className="aspect-square h-[220px] shrink-0">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="key"
                    hideLabel
                    formatter={(value, _name, item) => {
                      const n = Number(value);
                      const clave = (item.payload as { key: Clave }).key;
                      return (
                        <span className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">{config[clave].label}</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {formatEntero(n)} · {formatPorcentaje(n / total)}
                          </span>
                        </span>
                      );
                    }}
                  />
                }
              />
              <Pie
                data={porciones}
                dataKey="conversaciones"
                nameKey="key"
                innerRadius={64}
                outerRadius={94}
                startAngle={90}
                endAngle={-270}
                strokeWidth={2}
                stroke="hsl(var(--card))"
                isAnimationActive={false}
              >
                {porciones.map((p) => (
                  <Cell key={p.key} fill={`var(--color-${p.key})`} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox)) return null;
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold tabular-nums">
                          {formatPorcentaje(rate?.tasaEscalamiento ?? 0)}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-xs">
                          transferidas
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>

          {/* Leyenda con valor: la identidad nunca depende solo del color. */}
          <ul className="grid w-full gap-3 text-sm">
            {porciones.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: config[p.key].color }} />
                <span className="min-w-0 flex-1 text-foreground">{config[p.key].label}</span>
                <span className="tabular-nums text-foreground">{formatEntero(p.conversaciones)}</span>
                <span className="w-14 text-right tabular-nums text-muted-foreground">
                  {formatPorcentaje(p.conversaciones / total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

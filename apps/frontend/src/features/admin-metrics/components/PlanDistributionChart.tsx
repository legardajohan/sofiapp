import { useMemo } from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { formatEntero } from '../lib/format.js';
import type { PlanDistribution } from '../types/index.js';

interface Props {
  planes: PlanDistribution[] | undefined;
  isLoading: boolean;
}

const MAX_COLORES = 5;
const NEUTRO = 'hsl(var(--muted-foreground) / 0.45)';

interface Porcion {
  key: string;
  nombre: string;
  empresas: number;
  fill: string;
}

/**
 * Empresas por plan. El color sigue al PLAN (orden alfabético estable), no a su posición en el
 * ranking: si un plan gana empresas no se repinta. Pasados 5 planes, el resto se agrupa en "Otros";
 * "Sin plan" y "Otros" van en gris neutro porque no son una categoría del catálogo.
 */
export function PlanDistributionChart({ planes, isLoading }: Props): React.ReactElement {
  const { porciones, config, total } = useMemo(() => {
    const lista = planes ?? [];
    const conPlan = lista.filter((p) => p.planId !== null);
    const colorDe = new Map(
      [...conPlan]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .slice(0, MAX_COLORES)
        .map((p, i) => [p.planId, `hsl(var(--chart-${i + 1}))`]),
    );

    const resultado: Porcion[] = [];
    let otros = 0;
    for (const p of conPlan) {
      const fill = colorDe.get(p.planId);
      if (fill) resultado.push({ key: p.planId ?? p.nombre, nombre: p.nombre, empresas: p.empresas, fill });
      else otros += p.empresas;
    }
    if (otros > 0) resultado.push({ key: 'otros', nombre: 'Otros planes', empresas: otros, fill: NEUTRO });
    const sinPlan = lista.find((p) => p.planId === null);
    if (sinPlan) resultado.push({ key: 'sin-plan', nombre: 'Sin plan', empresas: sinPlan.empresas, fill: NEUTRO });

    const cfg: ChartConfig = Object.fromEntries(
      resultado.map((r) => [r.key, { label: r.nombre, color: r.fill }]),
    );
    return { porciones: resultado, config: cfg, total: resultado.reduce((s, r) => s + r.empresas, 0) };
  }, [planes]);

  return (
    <ChartCard title="Empresas por plan" description="Cómo se reparten las empresas entre los planes" isLoading={isLoading}>
      {total === 0 ? (
        <ChartEmpty>Aún no hay empresas registradas.</ChartEmpty>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ChartContainer config={config} className="aspect-square h-[220px] shrink-0">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
              <Pie
                data={porciones}
                dataKey="empresas"
                nameKey="key"
                innerRadius={62}
                outerRadius={92}
                strokeWidth={2}
                stroke="hsl(var(--card))"
                isAnimationActive={false}
              >
                {porciones.map((p) => (
                  <Cell key={p.key} fill={p.fill} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox)) return null;
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                          {formatEntero(total)}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-xs">
                          empresas
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>

          {/* Leyenda con valor: la identidad nunca depende solo del color. */}
          <ul className="grid w-full gap-2 text-sm">
            {porciones.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: p.fill }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{p.nombre}</span>
                <span className="tabular-nums text-muted-foreground">{formatEntero(p.empresas)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

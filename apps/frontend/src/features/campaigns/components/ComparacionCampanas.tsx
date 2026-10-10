import { Link } from 'react-router-dom';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatearTasa } from '../lib/metricas.js';
import type { CampaignMetricsResumenDTO } from '../types.js';
import { CONFIG_SERIES } from './ActividadDiaria.js';

const ALTO_FILA = 36;

/**
 * Tasa de respuesta de las mejores campañas del período, una barra por campaña.
 *
 * Horizontal porque las etiquetas son nombres de campaña —largos, de texto—, y una barra vertical
 * los obligaría a inclinarse. Ordenadas por la propia tasa (así llegan del API) para que el ranking
 * se lea de arriba abajo sin comparar alturas. El color es el de «Respuestas» en todo el módulo.
 *
 * Los nombres van además como enlaces debajo: la gráfica responde "¿cuál funcionó?", y la pregunta
 * siguiente es "¿qué le mandé?", que se contesta en el detalle.
 */
export function ComparacionCampanas({
  campanas,
}: {
  campanas: CampaignMetricsResumenDTO[];
}): React.ReactElement {
  const datos = campanas.map((c) => ({
    nombre: c.nombre,
    respuesta: c.tasas.respuesta ?? 0,
    etiqueta: formatearTasa(c.tasas.respuesta),
  }));

  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="text-sm text-foreground">Respuesta por campaña</figcaption>

      <ChartContainer
        config={{ respuesta: { label: 'Respuesta', color: CONFIG_SERIES.respondidos.color } }}
        className="aspect-auto w-full"
        style={{ height: datos.length * ALTO_FILA + 8 }}
      >
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, 'dataMax']} hide />
          <YAxis
            type="category"
            dataKey="nombre"
            width={140}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(valor) => `${formatearTasa(Number(valor))} de los entregados`}
              />
            }
          />
          <Bar
            dataKey="respuesta"
            fill="var(--color-respuesta)"
            radius={[0, 4, 4, 0]}
            barSize={16}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="etiqueta"
              position="right"
              offset={8}
              className="fill-foreground text-xs tabular-nums"
            />
          </Bar>
        </BarChart>
      </ChartContainer>

      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {campanas.map((c, i) => (
          <li key={c.id}>
            {i + 1}.{' '}
            <Link
              to={`/campanas/${c.id}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {c.nombre}
            </Link>
          </li>
        ))}
      </ol>
    </figure>
  );
}

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatearNumero } from '../lib/pacing.js';
import { formatearDiaCorto, formatearDiaLargo } from '../lib/metricas.js';
import type { PuntoSerie } from '../types.js';

/**
 * El color sigue a la entidad: «Respuestas» es naranja aquí, en la comparación de campañas y en
 * cualquier gráfica futura de este módulo. Los valores viven en `index.css` (`--serie-*`), con su
 * paso propio para dark, validados contra la superficie de la tarjeta.
 */
export const CONFIG_SERIES = {
  enviados: { label: 'Enviados', color: 'hsl(var(--serie-enviados))' },
  respondidos: { label: 'Respuestas', color: 'hsl(var(--serie-respuestas))' },
  convertidos: { label: 'Ventas', color: 'hsl(var(--serie-conversiones))' },
} satisfies ChartConfig;

/** Ejes recesivos: el dato manda, la retícula solo ayuda a leer la altura. */
const EJE_X = {
  dataKey: 'dia',
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  minTickGap: 24,
  tickFormatter: formatearDiaCorto,
} as const;

const EJE_Y = {
  allowDecimals: false,
  tickLine: false,
  axisLine: false,
  width: 36,
  tickFormatter: (v: number) => formatearNumero(v),
} as const;

const TOOLTIP = (
  <ChartTooltip
    cursor
    content={
      <ChartTooltipContent labelFormatter={(_, payload) => diaDelPayload(payload)} />
    }
  />
);

/** El tooltip de Recharts entrega el punto en `payload[0].payload`; de ahí sale el día. */
function diaDelPayload(payload: ReadonlyArray<{ payload?: unknown }>): string {
  const punto = payload[0]?.payload as PuntoSerie | undefined;
  return punto ? formatearDiaLargo(punto.dia) : '';
}

function total(serie: PuntoSerie[], campo: keyof Omit<PuntoSerie, 'dia'>): number {
  return serie.reduce((suma, p) => suma + p[campo], 0);
}

function Marco({
  titulo,
  children,
  leyenda,
}: {
  titulo: string;
  children: React.ReactNode;
  leyenda?: React.ReactNode;
}): React.ReactElement {
  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm text-foreground">{titulo}</span>
        {leyenda}
      </figcaption>
      {children}
    </figure>
  );
}

/** Leyenda con el total del período: nombra la serie y, a la vez, la etiqueta (regla de alivio). */
function Clave({ color, etiqueta, valor }: { color: string; etiqueta: string; valor: number }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
      {etiqueta}
      <span className="font-medium tabular-nums text-foreground">{formatearNumero(valor)}</span>
    </span>
  );
}

/**
 * Actividad por día en dos gráficas pequeñas, no en una.
 *
 * Enviados y respuestas viven en escalas distintas (mil envíos, treinta respuestas): en un mismo
 * eje las respuestas serían una línea plana pegada al cero, y con dos ejes Y la comparación de
 * alturas mentiría. Dos paneles, cada uno con su escala, leídos lado a lado sobre los mismos días.
 *
 * Sin animación de entrada: es una pantalla de consulta frecuente y se refresca sola; que las
 * barras crezcan en cada recarga sería ruido, no información.
 */
export function ActividadDiaria({ serie }: { serie: PuntoSerie[] }): React.ReactElement {
  const respuestas = total(serie, 'respondidos');
  const ventas = total(serie, 'convertidos');

  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      <Marco titulo="Mensajes enviados por día">
        <ChartContainer config={CONFIG_SERIES} className="aspect-auto h-44 w-full">
          <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis {...EJE_X} />
            <YAxis {...EJE_Y} />
            {TOOLTIP}
            <Bar
              dataKey="enviados"
              fill="var(--color-enviados)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      </Marco>

      <Marco
        titulo="Respuestas y ventas por día"
        leyenda={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Clave
              color={CONFIG_SERIES.respondidos.color}
              etiqueta={CONFIG_SERIES.respondidos.label}
              valor={respuestas}
            />
            <Clave
              color={CONFIG_SERIES.convertidos.color}
              etiqueta={CONFIG_SERIES.convertidos.label}
              valor={ventas}
            />
          </span>
        }
      >
        <ChartContainer config={CONFIG_SERIES} className="aspect-auto h-44 w-full">
          <LineChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis {...EJE_X} />
            <YAxis {...EJE_Y} />
            {TOOLTIP}
            {(['respondidos', 'convertidos'] as const).map((clave) => (
              <Line
                key={clave}
                dataKey={clave}
                type="linear"
                stroke={`var(--color-${clave})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </Marco>

      {/* La misma información en tabla, para lectores de pantalla: un SVG no se recorre. */}
      <table className="sr-only">
        <caption>Actividad por día</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Enviados</th>
            <th scope="col">Respuestas</th>
            <th scope="col">Ventas</th>
          </tr>
        </thead>
        <tbody>
          {serie.map((p) => (
            <tr key={p.dia}>
              <th scope="row">{formatearDiaLargo(p.dia)}</th>
              <td>{p.enviados}</td>
              <td>{p.respondidos}</td>
              <td>{p.convertidos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

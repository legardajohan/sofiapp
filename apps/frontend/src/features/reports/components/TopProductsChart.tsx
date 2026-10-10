import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { BookOpen } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { TopProducts } from '../types/index.js';

interface Props {
  report: TopProducts | undefined;
  isLoading: boolean;
}

type TipoFila = 'producto' | 'otros' | 'resto';

interface Fila {
  key: string;
  nombre: string;
  conversaciones: number;
  share: number;
  tipo: TipoFila;
  /** «140 · 36,8 %»: el conteo y su parte de las clasificadas, rotulado al final de la barra. */
  rotulo: string;
}

const ALTO_FILA = 40;

// Una sola serie: el título la nombra, así que no hay leyenda. `--chart-1` es el azul de "volumen"
// en el resto de reportes.
const config = {
  conversaciones: { label: 'Conversaciones', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const recortar = (v: string): string => (v.length > 22 ? `${v.slice(0, 21)}…` : v);

const rotulo = (f: { conversaciones: number; share: number }): string => `${formatEntero(f.conversaciones)} · ${formatPorcentaje(f.share)}`;

/** El ranking, y al final —atenuadas— las dos filas que no son un producto concreto. */
function filasDe(r: TopProducts): Fila[] {
  const filas: Omit<Fila, 'rotulo'>[] = r.ranking.map((p) => ({
    key: p.clave,
    nombre: p.nombre,
    conversaciones: p.conversaciones,
    share: p.share,
    tipo: 'producto',
  }));
  if (r.restantes.conversaciones > 0) {
    filas.push({
      key: '__resto',
      nombre: `Resto de productos (${formatEntero(r.restantes.productos)})`,
      conversaciones: r.restantes.conversaciones,
      share: r.restantes.share,
      tipo: 'resto',
    });
  }
  if (r.otros.conversaciones > 0) {
    filas.push({ key: '__otros', nombre: 'Otros temas', ...r.otros, tipo: 'otros' });
  }
  return filas.map((f) => ({ ...f, rotulo: rotulo(f) }));
}

/**
 * Productos más consultados (HU-REP-03): barras horizontales porque los nombres de producto son
 * largos y el orden ES la información. Cada barra lleva su conteo y su parte de las clasificadas.
 */
export function TopProductsChart({ report, isLoading }: Props): React.ReactElement {
  const filas = report ? filasDe(report) : [];
  const retirados = report?.ranking.filter((p) => !p.enCatalogo) ?? [];
  const alto = Math.max(filas.length * ALTO_FILA + 16, 160);

  return (
    <ChartCard
      title="Ranking de productos"
      description="Conversaciones por producto consultado. El porcentaje es sobre las conversaciones clasificadas."
      isLoading={isLoading}
    >
      {!report ? null : !report.catalogoDisponible ? (
        <ChartEmpty>
          <span className="flex flex-col items-center gap-3">
            <span>
              Carga tus productos en la tarjeta «Productos y servicios» de la base de conocimiento. Con ellos,
              la IA empieza a identificar qué consulta cada cliente.
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/knowledge">
                <BookOpen className="size-3.5" />
                Ir a la base de conocimiento
              </Link>
            </Button>
          </span>
        </ChartEmpty>
      ) : report.totalConsultas === 0 ? (
        <ChartEmpty>Ningún cliente escribió en este periodo.</ChartEmpty>
      ) : filas.length === 0 ? (
        <ChartEmpty>
          La IA todavía no clasificó las conversaciones de este periodo. Se clasifican a medida que Sofi las atiende.
        </ChartEmpty>
      ) : (
        <div className="space-y-4">
          <ChartContainer config={config} className="aspect-auto w-full" style={{ height: alto }}>
            <BarChart data={filas} layout="vertical" margin={{ left: 0, right: 96 }} barCategoryGap={8}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="nombre"
                tickLine={false}
                axisLine={false}
                width={168}
                tickFormatter={recortar}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    formatter={(_value, _name, item) => {
                      const f = item.payload as Fila;
                      return (
                        <span className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">Conversaciones</span>
                          <span className="font-medium tabular-nums text-foreground">{f.rotulo}</span>
                        </span>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="conversaciones" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
                {filas.map((f) => (
                  <Cell
                    key={f.key}
                    // "Otros" y "Resto" no son un producto: van en tinta neutra para no competir.
                    fill={f.tipo === 'producto' ? 'var(--color-conversaciones)' : 'hsl(var(--muted-foreground) / 0.45)'}
                  />
                ))}
                <LabelList
                  dataKey="rotulo"
                  position="right"
                  offset={8}
                  className="fill-foreground text-xs tabular-nums"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          {retirados.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-medium text-muted-foreground">
                Ya no está en tu base de conocimiento
              </Badge>
              <span>{retirados.map((p) => p.nombre).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}

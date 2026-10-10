import { Link } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCampaignsOverview } from '../hooks/useCampaigns.js';
import { formatearNumero } from '../lib/pacing.js';
import { formatearTasa } from '../lib/metricas.js';
import type { CampaignsOverviewDTO } from '../types.js';
import { ActividadDiaria } from './ActividadDiaria.js';
import { ComparacionCampanas } from './ComparacionCampanas.js';

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

interface Cifra {
  etiqueta: string;
  valor: string;
  /** Cuántas personas hay detrás del porcentaje: un 50 % de 2 no es un 50 % de 2.000. */
  base?: string;
}

function cifras(o: CampaignsOverviewDTO): Cifra[] {
  return [
    { etiqueta: 'enviados', valor: formatearNumero(o.enviados) },
    {
      etiqueta: 'entregados',
      valor: formatearTasa(o.tasas.entrega),
      base: formatearNumero(o.entregados),
    },
    {
      etiqueta: 'abiertos, como mínimo',
      valor: formatearTasa(o.tasas.apertura),
      base: formatearNumero(o.leidos),
    },
    {
      etiqueta: 'respondieron',
      valor: formatearTasa(o.tasas.respuesta),
      base: formatearNumero(o.respondidos),
    },
    {
      etiqueta: 'convirtieron',
      valor: formatearTasa(o.tasas.conversion),
      base: formatearNumero(o.convertidos),
    },
  ];
}

function plural(n: number, uno: string, varios: string): string {
  return `${formatearNumero(n)} ${n === 1 ? uno : varios}`;
}

/**
 * Resumen del período encima del historial de campañas (HU-MARK-04).
 *
 * Una franja, no una rejilla de tarjetas: son cinco cifras de **un mismo embudo** y separarlas en
 * cajas iguales las presentaría como indicadores independientes. Leídas en fila, de izquierda a
 * derecha, cuentan el recorrido. Debajo, las gráficas: la actividad por día (¿cuándo pasó?) y la
 * respuesta por campaña (¿cuál funcionó?), que son las dos preguntas que siguen a ver los números.
 */
export function CampaignsOverview({
  periodo,
  onPeriodoChange,
}: {
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
}): React.ReactElement {
  const { data, isPending, isError, isPlaceholderData } = useCampaignsOverview(periodo);
  const mejor = data?.campanas.find((c) => (c.tasas.respuesta ?? 0) > 0);

  return (
    <section
      aria-labelledby="resumen-titulo"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="resumen-titulo" className="text-sm font-medium text-foreground">
          Resultados
          {data ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {plural(data.totalCampanas, 'campaña iniciada', 'campañas iniciadas')}
            </span>
          ) : null}
        </h2>
        <div className="w-44">
          <Select
            value={String(periodo)}
            onValueChange={(v) => onPeriodoChange(Number(v) as Periodo)}
          >
            <SelectTrigger aria-label="Período del resumen" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  Últimos {p} días
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <div className="mt-5 flex flex-wrap gap-8" aria-busy="true" aria-label="Cargando resumen">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No se pudo cargar el resumen. Recarga la página para intentarlo de nuevo.
        </p>
      ) : data.totalCampanas === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Ninguna campaña arrancó en los últimos {periodo} días.
        </p>
      ) : (
        <div
          className={cn(
            'transition-opacity duration-150',
            // Al cambiar de período se conservan las cifras anteriores atenuadas, no un esqueleto:
            // el salto de contenido haría perder el sitio a quien está comparando.
            isPlaceholderData && 'opacity-60',
          )}
        >
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
            {cifras(data).map((c) => (
              <div key={c.etiqueta} className="flex flex-col-reverse">
                <dt className="mt-0.5 text-xs text-muted-foreground">
                  {c.etiqueta}
                  {c.base !== undefined ? <span className="tabular-nums"> ({c.base})</span> : null}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {c.valor}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 space-y-6 border-t border-border pt-5">
            <ActividadDiaria serie={data.serie} />

            {/* Comparar exige al menos dos. Con una sola, basta con nombrarla. */}
            {data.campanas.length >= 2 ? (
              <ComparacionCampanas campanas={data.campanas} />
            ) : mejor ? (
              <p className="text-sm text-muted-foreground">
                La que más respuesta tuvo:{' '}
                <Link
                  to={`/campanas/${mejor.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {mejor.nombre}
                </Link>{' '}
                <span className="tabular-nums">({formatearTasa(mejor.tasas.respuesta)})</span>
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { TopProducts } from '../types/index.js';

interface Props {
  report: TopProducts | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que las franjas de HU-REP-01/02: celdas con divisores de 1px.
const STRIP = 'grid grid-cols-2 gap-px overflow-hidden bg-border xl:grid-cols-4';

/**
 * Cifras del periodo. La celda con acento es la respuesta a la historia —qué se consulta más— y va
 * entre el volumen y la cobertura de la clasificación, que son el contexto para leerla.
 */
export function TopProductsKpiStrip({ report, isLoading }: Props): React.ReactElement {
  if (isLoading || !report) {
    return (
      <Card className={STRIP} aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </Card>
    );
  }

  const lider = report.ranking[0];
  const cobertura = report.totalConsultas ? report.clasificadas / report.totalConsultas : 0;

  return (
    <Card className={STRIP}>
      <Celda label="Consultas" valor={formatEntero(report.totalConsultas)} detalle="Conversaciones en las que escribió el cliente" />
      <div className="flex min-w-0 flex-col gap-1 bg-secondary p-5">
        <span className="text-sm font-medium text-primary">Producto más consultado</span>
        {lider ? (
          <>
            <span className="truncate text-2xl font-semibold tracking-tight text-foreground" title={lider.nombre}>
              {lider.nombre}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatEntero(lider.conversaciones)} conversaciones, {formatPorcentaje(lider.share)} de las clasificadas
            </span>
          </>
        ) : (
          <>
            <span className="text-2xl font-semibold tracking-tight text-muted-foreground">Sin datos</span>
            <span className="text-xs text-muted-foreground">Ninguna conversación tiene producto todavía</span>
          </>
        )}
      </div>
      <Celda
        label="Clasificadas"
        valor={formatEntero(report.clasificadas)}
        detalle={`${formatPorcentaje(cobertura)} de las consultas`}
      />
      <Celda
        label="Sin clasificar"
        valor={formatEntero(report.sinClasificar)}
        detalle="La IA todavía no les asignó un producto"
      />
    </Card>
  );
}

function Celda({ label, valor, detalle }: { label: string; valor: string; detalle: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1 bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{valor}</span>
      <span className="text-xs text-muted-foreground">{detalle}</span>
    </div>
  );
}

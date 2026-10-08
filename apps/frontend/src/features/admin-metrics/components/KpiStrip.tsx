import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEntero, formatPorcentaje } from '../lib/format.js';
import type { GlobalMetricsConsolidado } from '../types/index.js';

interface Props {
  consolidado: GlobalMetricsConsolidado | undefined;
  isLoading: boolean;
  /** El rango solo afecta a conversaciones, leads, ventas y campañas: se dice en su detalle. */
  conRango: boolean;
}

// `gap-px` sobre `bg-border`: divisores de 1px exactos en 2, 3 o 6 columnas, sin bordes dobles.
const STRIP = 'grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 xl:grid-cols-6';

interface Celda {
  key: string;
  label: string;
  valor: number;
  detalle: string;
}

/**
 * Los totales del SaaS como una sola franja, no seis tarjetas sueltas: se leen de corrido, como un
 * libro mayor. La única celda con acento es Ventas, porque es la que responde "¿está funcionando?".
 */
export function KpiStrip({ consolidado, isLoading, conRango }: Props): React.ReactElement {
  if (isLoading || !consolidado) {
    return (
      <Card className={STRIP} aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 bg-card p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </Card>
    );
  }

  const c = consolidado;
  const enPeriodo = conRango ? ' en el periodo' : '';
  const celdas: Celda[] = [
    {
      key: 'empresas',
      label: 'Empresas',
      valor: c.empresas.total,
      detalle: `${formatEntero(c.empresas.porEstado.activo)} activas, ${formatEntero(c.empresas.porEstado.prueba)} en prueba`,
    },
    {
      key: 'usuarios',
      label: 'Usuarios',
      valor: c.usuarios.total,
      detalle: `${formatEntero(c.usuarios.activos)} activos`,
    },
    {
      key: 'conversaciones',
      label: 'Conversaciones',
      valor: c.conversaciones.total,
      detalle: `${formatEntero(c.conversaciones.activas)} con mensajes ${conRango ? 'en el periodo' : 'en 30 días'}`,
    },
    {
      key: 'leads',
      label: 'Leads',
      valor: c.leads,
      detalle: `${formatEntero(c.mensajes.inbound + c.mensajes.outbound)} mensajes${enPeriodo}`,
    },
    {
      key: 'campanas',
      label: 'Campañas',
      valor: c.campanas.total,
      detalle: `${formatEntero(c.campanas.porEstado.completada)} completadas`,
    },
  ];

  return (
    <Card className={STRIP}>
      {celdas.map((celda) => (
        <div
          key={celda.key}
          className="flex flex-col gap-1 bg-card p-5"
        >
          <span className="text-sm text-muted-foreground">{celda.label}</span>
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatEntero(celda.valor)}
          </span>
          <span className="text-xs text-muted-foreground">{celda.detalle}</span>
        </div>
      ))}

      {/* Ventas: la celda con acento. El medidor es la conversión leads → ventas. */}
      <div
        className="flex flex-col gap-1 bg-secondary p-5"
      >
        <span className="text-sm font-medium text-primary">Ventas</span>
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatEntero(c.ventas)}
        </span>
        <Progress
          value={Math.min(100, c.tasaConversion * 100)}
          className="mt-1 h-1.5 bg-primary/15"
          aria-label={`Conversión de leads a ventas: ${formatPorcentaje(c.tasaConversion)}`}
        />
        <span className="text-xs text-muted-foreground">
          {formatPorcentaje(c.tasaConversion)} de los leads{enPeriodo}
        </span>
      </div>
    </Card>
  );
}

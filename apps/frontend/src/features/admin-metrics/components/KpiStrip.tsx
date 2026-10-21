import { Building2, DollarSign, Megaphone, MessageSquare, Target, Users, type LucideIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { KpiCell, KpiStripCard, KpiStripSkeleton } from '@/components/charts/KpiCell';
import { formatEntero, formatPorcentaje } from '../lib/format.js';
import type { GlobalMetricsConsolidado } from '../types/index.js';

interface Props {
  consolidado: GlobalMetricsConsolidado | undefined;
  isLoading: boolean;
  /** El rango solo afecta a conversaciones, leads, ventas y campañas: se dice en su detalle. */
  conRango: boolean;
}

// `gap-px` sobre `bg-border`: divisores de 1px exactos en 2, 3 o 6 columnas, sin bordes dobles.
const COLUMNAS = 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6';

interface Celda {
  key: string;
  icon: LucideIcon;
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
    return <KpiStripSkeleton count={6} columns={COLUMNAS} />;
  }

  const c = consolidado;
  const enPeriodo = conRango ? ' en el periodo' : '';
  const celdas: Celda[] = [
    {
      key: 'empresas',
      icon: Building2,
      label: 'Empresas',
      valor: c.empresas.total,
      detalle: `${formatEntero(c.empresas.porEstado.activo)} activas, ${formatEntero(c.empresas.porEstado.prueba)} en prueba`,
    },
    {
      key: 'usuarios',
      icon: Users,
      label: 'Usuarios',
      valor: c.usuarios.total,
      detalle: `${formatEntero(c.usuarios.activos)} activos`,
    },
    {
      key: 'conversaciones',
      icon: MessageSquare,
      label: 'Conversaciones',
      valor: c.conversaciones.total,
      detalle: `${formatEntero(c.conversaciones.activas)} con mensajes ${conRango ? 'en el periodo' : 'en 30 días'}`,
    },
    {
      key: 'leads',
      icon: Target,
      label: 'Leads',
      valor: c.leads,
      detalle: `${formatEntero(c.mensajes.inbound + c.mensajes.outbound)} mensajes${enPeriodo}`,
    },
    {
      key: 'campanas',
      icon: Megaphone,
      label: 'Campañas',
      valor: c.campanas.total,
      detalle: `${formatEntero(c.campanas.porEstado.completada)} completadas`,
    },
  ];

  return (
    <KpiStripCard columns={COLUMNAS}>
      {celdas.map((celda) => (
        <KpiCell
          key={celda.key}
          icon={celda.icon}
          label={celda.label}
          value={formatEntero(celda.valor)}
          detail={celda.detalle}
        />
      ))}

      {/* Ventas: la celda con acento. El medidor es la conversión leads → ventas. */}
      <KpiCell
        accent
        icon={DollarSign}
        label="Ventas"
        value={formatEntero(c.ventas)}
        detail={`${formatPorcentaje(c.tasaConversion)} de los leads${enPeriodo}`}
      >
        <Progress
          value={Math.min(100, c.tasaConversion * 100)}
          className="mt-1 h-1.5 bg-primary/15"
          aria-label={`Conversión de leads a ventas: ${formatPorcentaje(c.tasaConversion)}`}
        />
      </KpiCell>
    </KpiStripCard>
  );
}

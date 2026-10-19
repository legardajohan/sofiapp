import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Franja de KPIs de los tableros (HU-SAAS-03, HU-REP-01…05): una sola `Card` con divisores de 1px
 * (`gap-px` sobre `bg-border`), no tarjetas sueltas. `columns` fija la rejilla de cada tablero.
 */
export function KpiStripCard({ columns, children }: { columns: string; children: React.ReactNode }): React.ReactElement {
  return <Card className={cn('grid gap-px overflow-hidden bg-border', columns)}>{children}</Card>;
}

export interface KpiCellProps {
  icon: LucideIcon;
  label: string;
  /** Ya formateado por quien llama. */
  value: React.ReactNode;
  detail?: React.ReactNode;
  /** La celda que responde la pregunta del tablero: fondo `secondary` y etiqueta/icono en `primary`. */
  accent?: boolean;
  valueClassName?: string;
  detailClassName?: string;
  /** Va entre el valor y el detalle (p. ej. el medidor `Progress` de la celda con acento). */
  children?: React.ReactNode;
}

/**
 * Una celda de la franja. El icono es decorativo (la etiqueta ya lo dice) y siempre ocupa el mismo
 * sitio —a la derecha de la etiqueta, 16px, en el tono de la etiqueta— en todos los tableros.
 */
export function KpiCell({
  icon: Icon,
  label,
  value,
  detail,
  accent = false,
  valueClassName,
  detailClassName,
  children,
}: KpiCellProps): React.ReactElement {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 p-5', accent ? 'bg-secondary' : 'bg-card')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-sm', accent ? 'font-medium text-primary' : 'text-muted-foreground')}>{label}</span>
        <Icon
          aria-hidden="true"
          data-kpi-icon=""
          className={cn('size-4 shrink-0', accent ? 'text-primary' : 'text-muted-foreground')}
        />
      </div>
      <span className={cn('text-3xl font-semibold tabular-nums tracking-tight text-foreground', valueClassName)}>
        {value}
      </span>
      {children}
      {detail !== undefined && <span className={cn('text-xs text-muted-foreground', detailClassName)}>{detail}</span>}
    </div>
  );
}

/** Esqueleto de la franja: reserva el hueco del icono para que nada salte al llegar los datos. */
export function KpiStripSkeleton({ count, columns }: { count: number; columns: string }): React.ReactElement {
  return (
    <Card className={cn('grid gap-px overflow-hidden bg-border', columns)} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="size-4 rounded-sm" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </Card>
  );
}

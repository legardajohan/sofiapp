import type { EstadoPlantilla } from '../types/index.js';

const CONFIG: Record<EstadoPlantilla, { label: string; className: string; dotClassName: string }> = {
  APPROVED: {
    label: 'Aprobada',
    className: 'bg-success-subtle text-success border-success/30',
    dotClassName: 'bg-success',
  },
  PENDING: {
    label: 'Esperando a Meta',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
    dotClassName: 'bg-amber-500',
  },
  REJECTED: {
    label: 'Rechazada',
    className: 'bg-destructive-subtle text-destructive border-destructive/30',
    dotClassName: 'bg-destructive',
  },
  PAUSED: {
    label: 'Pausada',
    className: 'bg-muted text-muted-foreground border-border',
    dotClassName: 'bg-muted-foreground',
  },
  DISABLED: {
    label: 'Deshabilitada',
    className: 'bg-muted text-muted-foreground border-border',
    dotClassName: 'bg-muted-foreground',
  },
};

export function TemplateStatusBadge({ status }: { status: EstadoPlantilla }): React.ReactElement {
  const { label, className, dotClassName } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
      {label}
    </span>
  );
}

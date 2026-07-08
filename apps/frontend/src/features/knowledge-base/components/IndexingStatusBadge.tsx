import type { EstadoIndexacion } from '../types/index.js';

const CONFIG: Record<
  EstadoIndexacion,
  { label: string; className: string; dotClassName: string; pulse: boolean }
> = {
  pendiente: {
    label: 'Pendiente',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
    dotClassName: 'bg-gray-400',
    pulse: false,
  },
  procesando: {
    label: 'Procesando',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClassName: 'bg-amber-500',
    pulse: true,
  },
  indexado: {
    label: 'Indexado',
    className: 'bg-success-subtle text-success border-success/30',
    dotClassName: 'bg-success',
    pulse: false,
  },
  fallido: {
    label: 'Fallido',
    className: 'bg-destructive-subtle text-destructive border-destructive/30',
    dotClassName: 'bg-destructive',
    pulse: false,
  },
};

export function IndexingStatusBadge({
  estado,
}: {
  estado: EstadoIndexacion;
}): React.ReactElement {
  const { label, className, dotClassName, pulse } = CONFIG[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClassName} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

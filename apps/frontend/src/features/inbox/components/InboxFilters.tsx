import { cn } from '@/lib/utils';
import type { FiltroBandeja } from '../types.js';

const FILTERS: { key: FiltroBandeja; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'mios', label: 'Míos' },
  { key: 'sin_asignar', label: 'Sin asignar' },
  { key: 'sofi', label: 'Sofi activa' },
];

interface Props {
  value: FiltroBandeja;
  onChange: (filtro: FiltroBandeja) => void;
}

export function InboxFilters({ value, onChange }: Props): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border p-2">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-out active:scale-[0.98]',
            value === f.key
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

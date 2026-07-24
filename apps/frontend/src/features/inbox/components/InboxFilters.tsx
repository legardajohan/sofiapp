import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenantUsers } from '@/features/users/hooks/useTenantUsers';
import type { EstadoComercial, FiltroBandeja } from '../types.js';

const FILTERS: { key: FiltroBandeja; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'mios', label: 'Míos' },
  { key: 'sin_asignar', label: 'Sin asignar' },
  { key: 'sofi', label: 'Sofi activa' },
];

const ESTADO_LABEL: Record<EstadoComercial, string> = {
  nuevo: 'Nuevo',
  en_gestion: 'En gestión',
  pago_pendiente: 'Pago pendiente',
  pagado: 'Pagado',
  perdido: 'Perdido',
};

const TODOS = '__todos__';
// Coincide con el literal que espera el backend (`?asignadoA=sin_asignar`) — no es un sentinel de UI.
const SIN_ASIGNAR = 'sin_asignar';

interface Props {
  value: FiltroBandeja;
  onChange: (filtro: FiltroBandeja) => void;
  asignadoA?: string;
  onAsignadoAChange: (asignadoA: string | undefined) => void;
  estado?: EstadoComercial;
  onEstadoChange: (estado: EstadoComercial | undefined) => void;
}

export function InboxFilters({
  value,
  onChange,
  asignadoA,
  onAsignadoAChange,
  estado,
  onEstadoChange,
}: Props): React.ReactElement {
  const { data: admins } = useTenantUsers();

  return (
    <div className="flex flex-col gap-2 border-b border-border p-2">
      <div className="flex flex-wrap gap-1">
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

      <div className="flex flex-wrap gap-1.5">
        <Select
          value={asignadoA ?? TODOS}
          onValueChange={(v) => onAsignadoAChange(v === TODOS ? undefined : v)}
        >
          <SelectTrigger className="h-7 w-auto gap-1 border-none bg-muted/60 px-2 text-xs shadow-none hover:bg-muted">
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los responsables</SelectItem>
            <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
            {admins?.map((admin) => (
              <SelectItem key={admin.id} value={admin.id}>
                {admin.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={estado ?? TODOS}
          onValueChange={(v) => onEstadoChange(v === TODOS ? undefined : (v as EstadoComercial))}
        >
          <SelectTrigger className="h-7 w-auto gap-1 border-none bg-muted/60 px-2 text-xs shadow-none hover:bg-muted">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {Object.entries(ESTADO_LABEL).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

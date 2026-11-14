import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenantUsers } from '@/features/users/hooks/useTenantUsers';
import type { FiltrosOrganizador } from '../types.js';

/** Radix Select no admite `value=""`: «cualquiera» necesita su propio valor. */
const TODOS = '__todos__';

interface Props {
  filtros: FiltrosOrganizador;
  /** Nombre del cliente filtrado, para el chip (la URL solo lleva su id). */
  clienteNombre: string | null;
  /** El historial no filtra por fecha programada. */
  conFechas: boolean;
  onChange: (cambio: Partial<FiltrosOrganizador>) => void;
  onClear: () => void;
}

/**
 * Filtros del Organizador: fecha programada, responsable (= autor de la nota) y cliente. El cliente
 * se elige desde la tabla —clic en su nombre— y aquí queda como un chip que se puede quitar.
 *
 * Fechas sin tope en «hoy», a diferencia del `DateRangeFilter` de reportes: aquí lo que interesa
 * muchas veces es el futuro (lo que viene la semana próxima).
 */
export function OrganizadorFilters({
  filtros,
  clienteNombre,
  conFechas,
  onChange,
  onClear,
}: Props): React.ReactElement {
  const usuarios = useTenantUsers();
  const invertido = !!filtros.desde && !!filtros.hasta && filtros.desde > filtros.hasta;
  const hayFiltros = Boolean(
    filtros.desde ?? filtros.hasta ?? filtros.responsableId ?? filtros.clienteId,
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      {conFechas && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="org-desde" className="text-xs text-muted-foreground">
              Programado desde
            </Label>
            <Input
              id="org-desde"
              type="date"
              className="h-9 w-40 text-sm"
              value={filtros.desde ?? ''}
              onChange={(e) => onChange({ desde: e.target.value || undefined })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-hasta" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="org-hasta"
              type="date"
              className="h-9 w-40 text-sm"
              value={filtros.hasta ?? ''}
              min={filtros.desde}
              aria-invalid={invertido}
              onChange={(e) => onChange({ hasta: e.target.value || undefined })}
            />
          </div>
        </>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="org-responsable" className="text-xs text-muted-foreground">
          Responsable
        </Label>
        <Select
          value={filtros.responsableId ?? TODOS}
          onValueChange={(v) => onChange({ responsableId: v === TODOS ? undefined : v })}
        >
          <SelectTrigger id="org-responsable" className="h-9 w-48">
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Cualquier responsable</SelectItem>
            {(usuarios.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtros.clienteId && (
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Cliente</span>
          <span className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-muted/50 pl-3 pr-1 text-sm">
            <span className="max-w-[12rem] truncate">{clienteNombre ?? 'Cliente seleccionado'}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Quitar filtro de cliente"
              className="size-7 text-muted-foreground"
              onClick={() => onChange({ clienteId: undefined })}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </span>
        </div>
      )}

      {hayFiltros && (
        <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={onClear}>
          <X className="size-3.5" aria-hidden="true" />
          Limpiar filtros
        </Button>
      )}

      {invertido && (
        <p role="alert" className="basis-full text-xs text-destructive">
          La fecha final es anterior a la inicial. Corrígela para ver resultados.
        </p>
      )}
    </div>
  );
}

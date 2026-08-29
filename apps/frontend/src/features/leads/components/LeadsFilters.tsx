import { useState } from 'react';
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
import { useTenantUsers } from '../../users/hooks/useTenantUsers.js';
import { useEstados } from '../../estados/hooks/useEstados.js';
import { NuevoEstadoDialog } from './NuevoEstadoDialog.js';
import type { SemaforoSlug } from '../../tags/types.js';
import { useTags } from '../../tags/hooks/useTags.js';
import {
  RANGOS,
  SEMAFORO_LABEL,
  fechasARango,
  rangoAFechas,
  type RangoKey,
} from '../lib/format.js';
import type { LeadsFiltros } from '../types.js';

/**
 * Centinela para "sin filtro". Radix Select no admite `value=""` en un item, así que el "todos"
 * necesita un valor propio que nunca colisione con un id ni con un slug.
 */
const TODOS = '__todos__';

const SEMAFOROS: SemaforoSlug[] = ['verde', 'naranja', 'rojo', 'azul'];

interface Props {
  filtros: LeadsFiltros;
  onChange: (cambio: Partial<LeadsFiltros>) => void;
  onClear: () => void;
}

/** Campo con su etiqueta encima. Ancho fijo para que la barra no baile al cambiar de opción. */
function Campo({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function LeadsFilters({ filtros, onChange, onClear }: Props): React.ReactElement {
  const usuarios = useTenantUsers();
  const estados = useEstados();
  const tags = useTags();

  /**
   * "Personalizado" no se deduce de las fechas: sin fechas puestas, `fechasARango` devolvería
   * `'todo'` y los dos campos no llegarían a aparecer nunca — elegirlo no hacía nada visible.
   * Por eso se recuerda la elección aparte, y se suelta en cuanto se elige un preset.
   */
  const [personalizado, setPersonalizado] = useState(false);
  const rangoDeFechas = fechasARango({ desde: filtros.desde, hasta: filtros.hasta });
  const rango: RangoKey = personalizado ? 'personalizado' : rangoDeFechas;
  const hayFiltros = Boolean(
    filtros.estado ?? filtros.asesor ?? filtros.semaforo ?? filtros.desde ?? filtros.hasta,
  );

  /** El color y el nombre reales los pone el tenant: puede haberlas renombrado o recoloreado. */
  function tagDe(slug: SemaforoSlug) {
    return tags.data?.find((t) => t.semaforo === slug);
  }

  function cambiarRango(key: RangoKey): void {
    setPersonalizado(key === 'personalizado');

    // "Personalizado" no calcula nada: abre los dos campos para que el usuario los teclee. No se
    // emite ningún cambio, porque todavía no hay filtro nuevo que aplicar; emitirlo resetearía la
    // paginación por un clic que aún no ha filtrado nada.
    if (key === 'personalizado') return;

    onChange(rangoAFechas(key));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Campo label="Estado" htmlFor="filtro-estado">
        <Select
          value={filtros.estado ?? TODOS}
          onValueChange={(v) => onChange({ estado: v === TODOS ? undefined : v })}
        >
          <SelectTrigger id="filtro-estado" className="h-9 w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {/* Del catálogo del tenant, no de una constante: cada empresa tiene su pipeline. Los
                archivados no se ofrecen para filtrar, aunque sigan resolviendo su etiqueta. */}
            {(estados.data ?? [])
              .filter((e) => e.activo)
              .map((estado) => (
                <SelectItem key={estado.key} value={estado.key}>
                  {estado.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Campo>

      <Campo label="Semáforo" htmlFor="filtro-semaforo">
        <Select
          value={filtros.semaforo ?? TODOS}
          onValueChange={(v) =>
            onChange({ semaforo: v === TODOS ? undefined : (v as SemaforoSlug) })
          }
        >
          <SelectTrigger id="filtro-semaforo" className="h-9 w-48">
            <SelectValue placeholder="Semáforo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Cualquier semáforo</SelectItem>
            {SEMAFOROS.map((slug) => {
              const tag = tagDe(slug);
              return (
                <SelectItem key={slug} value={slug}>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag?.color ?? 'currentColor' }}
                    />
                    {tag?.nombre ?? SEMAFORO_LABEL[slug]}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Campo>

      <Campo label="Responsable" htmlFor="filtro-asesor">
        <Select
          value={filtros.asesor ?? TODOS}
          onValueChange={(v) => onChange({ asesor: v === TODOS ? undefined : v })}
        >
          <SelectTrigger id="filtro-asesor" className="h-9 w-48">
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
      </Campo>

      <Campo label="Fecha de creación" htmlFor="filtro-rango">
        <Select value={rango} onValueChange={(v) => cambiarRango(v as RangoKey)}>
          <SelectTrigger id="filtro-rango" className="h-9 w-48">
            <SelectValue placeholder="Cualquier fecha" />
          </SelectTrigger>
          <SelectContent>
            {RANGOS.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>

      {rango === 'personalizado' && (
        <>
          <Campo label="Desde" htmlFor="filtro-desde">
            <Input
              id="filtro-desde"
              type="date"
              className="h-9 w-40"
              value={filtros.desde ?? ''}
              max={filtros.hasta}
              onChange={(e) => onChange({ desde: e.target.value || undefined })}
            />
          </Campo>
          <Campo label="Hasta" htmlFor="filtro-hasta">
            <Input
              id="filtro-hasta"
              type="date"
              className="h-9 w-40"
              value={filtros.hasta ?? ''}
              min={filtros.desde}
              onChange={(e) => onChange({ hasta: e.target.value || undefined })}
            />
          </Campo>
        </>
      )}

      <NuevoEstadoDialog />

      {hayFiltros && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => {
            setPersonalizado(false);
            onClear();
          }}
        >
          <X className="mr-1.5 h-4 w-4" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

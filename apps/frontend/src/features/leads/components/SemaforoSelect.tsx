import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useUpdateLeadSemaforo } from '../hooks/useUpdateLeadSemaforo.js';
import { COLOR_ESTADO_DESCONOCIDO } from '../lib/format.js';
import type { SemaforoDTO } from '../../semaforos/types.js';
import type { LeadListItemDTO } from '../types.js';

/**
 * Centinela para "sin clasificar". Radix Select no admite `value=""` en un item, así que necesita
 * un valor propio que nunca colisione con una `key` del catálogo.
 */
const SIN_CLASIFICAR = '__sin_clasificar__';

interface Props {
  lead: LeadListItemDTO;
  /** Catálogo del tenant. Puede traer archivados: no se ofrecen, pero sí resuelven su etiqueta. */
  semaforos: SemaforoDTO[];
}

/** Punto de color del semáforo. El color lo decide el tenant, por eso va en `style`. */
function Punto({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-2 w-2 shrink-0 rounded-full transition-colors duration-150 ease-out"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Clasificar comercialmente un lead (HU-CRM-04).
 *
 * Va **pegado** a `EstadoSelect` en la cabecera del panel y replica su forma a propósito: son dos
 * decisiones del mismo tipo sobre el mismo lead —etapa del pipeline y temperatura comercial— y
 * darles dos controles distintos sería inconsistencia, no jerarquía.
 *
 * Se ofrecen los activos más —si toca— el que el lead lleva puesto aunque esté archivado: esconder
 * su propio semáforo dejaría el control mintiendo sobre lo que muestra. Y "Sin clasificar" es una
 * opción de verdad, no un placeholder: retirar la clasificación es una acción legítima.
 */
export function SemaforoSelect({ lead, semaforos }: Props): React.ReactElement {
  const cambiar = useUpdateLeadSemaforo();
  const actual = lead.semaforo;
  const opciones = semaforos.filter((s) => s.activo || s.key === actual?.key);

  return (
    <Select
      value={actual?.key ?? SIN_CLASIFICAR}
      disabled={cambiar.isPending}
      onValueChange={(key) => {
        const semaforo = key === SIN_CLASIFICAR ? null : key;
        if (semaforo !== (actual?.key ?? null)) cambiar.mutate({ id: lead.id, semaforo });
      }}
    >
      <SelectTrigger
        className="h-8 w-auto gap-2 border-border px-2.5"
        aria-label="Semáforo del lead"
      >
        <span className="flex items-center gap-2">
          <Punto color={actual?.color ?? COLOR_ESTADO_DESCONOCIDO} />
          <span className="text-sm">{actual?.label ?? 'Sin clasificar'}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SIN_CLASIFICAR}>
          <span className="flex items-center gap-2">
            <Punto color={COLOR_ESTADO_DESCONOCIDO} />
            Sin clasificar
          </span>
        </SelectItem>
        {opciones.map((semaforo) => (
          <SelectItem key={semaforo.key} value={semaforo.key}>
            <span className="flex items-center gap-2">
              <Punto color={semaforo.color} />
              {semaforo.label}
              {!semaforo.activo && <span className="text-muted-foreground">(archivado)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { estadoIntervalo } from '../../lib/kb-horario.js';
import type { KbScheduleInterval } from '../../types/index.js';

/** Tope de la descripción. Es una etiqueta («Solo recepción de pedidos»), no un párrafo. */
export const DESCRIPCION_MAX = 80;

const ERROR_INVERTIDO = 'La hora de cierre debe ser posterior a la de apertura.';
const AVISO_INCOMPLETO = 'Completa las dos horas.';

interface ScheduleIntervalRowProps {
  intervalo: KbScheduleInterval;
  onChange: (intervalo: KbScheduleInterval) => void;
  onQuitar: () => void;
  /** Para los `aria-label`: con 7 días en el mismo árbol, el nombre del día es lo que los separa. */
  dia: string;
  indice: number;
}

/**
 * Un tramo de atención: desde, hasta y para qué es.
 *
 * **Los dos avisos no son el mismo aviso**, y por eso no comparten ni color ni `aria-invalid`:
 *  - «cierra antes de abrir» es un **error**: va en `destructive`, marca los campos y bloquea el
 *    guardado, porque el tramo no llegará al texto y el admin lo daría por guardado.
 *  - «falta una hora» es una **tarea pendiente**: va en `muted` y no bloquea nada. Es el estado
 *    natural mientras se teclea, y apagar el botón Guardar en ese momento sería hostil.
 */
export function ScheduleIntervalRow({
  intervalo,
  onChange,
  onQuitar,
  dia,
  indice,
}: ScheduleIntervalRowProps): React.ReactElement {
  const estado = estadoIntervalo(intervalo);
  const invertido = estado === 'invertido';
  const numero = indice + 1;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="time"
          aria-label={`Abre el ${dia}, horario ${numero}`}
          aria-invalid={invertido}
          value={intervalo.desde}
          onChange={(e) => onChange({ ...intervalo, desde: e.target.value })}
          className="w-28"
        />
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          a
        </span>
        <Input
          type="time"
          aria-label={`Cierra el ${dia}, horario ${numero}`}
          aria-invalid={invertido}
          value={intervalo.hasta}
          onChange={(e) => onChange({ ...intervalo, hasta: e.target.value })}
          className="w-28"
        />

        <Input
          type="text"
          aria-label={`Descripción del horario ${numero} del ${dia}`}
          placeholder="Descripción (opcional)"
          value={intervalo.descripcion ?? ''}
          maxLength={DESCRIPCION_MAX}
          onChange={(e) => onChange({ ...intervalo, descripcion: e.target.value })}
          className="min-w-0 flex-1"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
          onClick={onQuitar}
          aria-label={`Quitar horario ${numero} del ${dia}`}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {invertido && <p className="text-xs text-destructive">{ERROR_INVERTIDO}</p>}
      {estado === 'incompleto' && <p className="text-xs text-muted-foreground">{AVISO_INCOMPLETO}</p>}
    </div>
  );
}

import { useState } from 'react';
import { es } from 'react-day-picker/locale';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { aDiaCivil, deDiaCivil, etiquetaDia } from '@/lib/agenda';

interface Props {
  /** Día civil elegido; `null` = no se eligió y el pendiente será de hoy (RN10). */
  dia: string | null;
  /** `HH:mm`; `null` = de todo el día. */
  hora: string | null;
  onDiaChange: (dia: string) => void;
  onHoraChange: (hora: string | null) => void;
  disabled?: boolean;
}

/**
 * Fecha y hora de un pendiente (HU-PDF-01 A1), en una sola línea para que quepa en el panel de la
 * ficha.
 *
 * Los dos datos son opcionales y el control lo dice sin pedir nada: el día arranca en «Hoy» —que es
 * lo que el backend asume si no se elige— y la hora vacía significa «todo el día», escrito debajo.
 * Así nunca hay que tocar nada para un pendiente de hoy, que es el caso más común.
 *
 * Calendario en un `Popover` y hora en un `input type="time"` nativo: el selector de hora del sistema
 * es mejor en móvil que cualquier lista hecha a mano.
 */
export function ProgramacionPendiente({
  dia,
  hora,
  onDiaChange,
  onHoraChange,
  disabled = false,
}: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const diaVisible = dia ?? aDiaCivil(new Date());

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-label={`Fecha del pendiente: ${etiquetaDia(diaVisible)}`}
              className="h-8 gap-1.5 px-2.5 text-xs font-normal motion-safe:active:scale-[0.97]"
            >
              <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {etiquetaDia(diaVisible)}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={es}
              selected={deDiaCivil(diaVisible)}
              defaultMonth={deDiaCivil(diaVisible)}
              onSelect={(fecha) => {
                if (!fecha) return;
                onDiaChange(aDiaCivil(fecha));
                setAbierto(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <Input
          type="time"
          aria-label="Hora del pendiente"
          value={hora ?? ''}
          disabled={disabled}
          onChange={(e) => onHoraChange(e.target.value || null)}
          className="h-8 w-[6.5rem] px-2 text-xs tabular-nums"
        />

        {hora && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Quitar la hora"
            title="Quitar la hora: será de todo el día"
            className="size-7 text-muted-foreground"
            onClick={() => onHoraChange(null)}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {hora ? 'Irá a Pendientes del embudo a esa hora.' : 'Sin hora, es un pendiente de todo el día.'}
      </p>
    </div>
  );
}

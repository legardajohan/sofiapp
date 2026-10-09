import { useId } from 'react';
import { es } from 'react-day-picker/locale';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  combinarFechaHora,
  distanciaRelativa,
  fechaLarga,
  horaDe,
  problemaConHora,
  zonaHoraria,
} from '../lib/programacion.js';

interface Props {
  valor: Date | null;
  onChange: (fecha: Date | null) => void;
}

/** Hora por defecto al elegir un día sin hora: media mañana, cuando la gente lee el teléfono. */
const HORA_POR_DEFECTO = '09:00';

function inicioDeHoy(): Date {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

/**
 * Día y hora del envío.
 *
 * El calendario va **abierto**, no dentro de un popover: vive en pasos y diálogos cuya única
 * pregunta es «¿cuándo?», así que esconderlo tras un botón sería un clic de más. (Y un popover
 * dentro de un `Dialog` de Radix pelea con su trampa de foco.)
 *
 * Día y hora son dos controles porque se piensan por separado —«el jueves», «a las nueve»— y el
 * `datetime-local` nativo se ve distinto en cada navegador y casi no se usa con teclado. Al lado,
 * la confirmación en palabras con la zona horaria: la hora programada es la del navegador, y
 * decirlo evita el error clásico de quien administra desde otro país.
 */
export function DateTimePicker({ valor, onChange }: Props): React.ReactElement {
  const horaId = useId();
  const hora = valor ? horaDe(valor) : HORA_POR_DEFECTO;
  const problema = valor ? problemaConHora(valor) : null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Calendar
        mode="single"
        locale={es}
        selected={valor ?? undefined}
        defaultMonth={valor ?? undefined}
        disabled={{ before: inicioDeHoy() }}
        onSelect={(dia) => {
          if (dia) onChange(combinarFechaHora(dia, hora));
        }}
        className="w-fit rounded-lg border border-border"
      />

      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={horaId}>Hora</Label>
          <Input
            id={horaId}
            type="time"
            step={300}
            value={hora}
            disabled={!valor}
            onChange={(e) => {
              if (!valor || !e.target.value) return;
              onChange(combinarFechaHora(valor, e.target.value));
            }}
            className="w-32 tabular-nums"
          />
        </div>

        {!valor ? (
          <p className="text-sm text-muted-foreground">Elige el día en el calendario.</p>
        ) : problema ? (
          <p role="alert" className="text-sm text-destructive">
            {problema}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Sale el <span className="font-medium text-foreground">{fechaLarga(valor)}</span>,{' '}
            {distanciaRelativa(valor)}.
            <span className="mt-1 block">Hora de {zonaHoraria()}.</span>
          </p>
        )}
      </div>
    </div>
  );
}

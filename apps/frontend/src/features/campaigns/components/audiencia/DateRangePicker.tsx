import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { MAX_DIAS_RANGO, fechaCorta } from '../../lib/rango.js';

interface Props {
  valor: DateRange | undefined;
  onChange: (rango: DateRange | undefined) => void;
  id?: string;
}

const DIA_MS = 86_400_000;

function finDeHoy(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Inicio y fin del rango personalizado (HU-MARK-07).
 *
 * El calendario **no deja elegir** lo que el servidor rechazaría: días futuros, y —una vez marcado
 * el inicio— días a más de `MAX_DIAS_RANGO` de él. Prevenir es mejor que un 400 después del clic.
 * Dos meses a la vista en escritorio: un rango de semanas casi siempre cruza un cambio de mes.
 *
 * El popover escala desde su disparador (`origin-[--radix-popover-content-transform-origin]`, ya
 * en el `PopoverContent` de shadcn): no hay animación propia que añadir.
 */
export function DateRangePicker({ valor, onChange, id }: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const hoy = finDeHoy();

  const desde = valor?.from;
  const limite =
    desde && !valor?.to
      ? (fecha: Date): boolean =>
          Math.abs(fecha.getTime() - desde.getTime()) >= MAX_DIAS_RANGO * DIA_MS
      : null;

  const texto =
    valor?.from && valor.to
      ? `${fechaCorta(valor.from)} – ${fechaCorta(valor.to)}`
      : valor?.from
        ? `${fechaCorta(valor.from)} – elige el fin`
        : 'Elige las fechas';

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start gap-2 font-normal sm:w-72',
            !valor?.from && 'text-muted-foreground',
          )}
        >
          <CalendarRange aria-hidden className="h-4 w-4 shrink-0" />
          <span className="truncate tabular-nums">{texto}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={es}
          numberOfMonths={2}
          defaultMonth={valor?.from ?? new Date(hoy.getTime() - 30 * DIA_MS)}
          selected={valor}
          onSelect={(r) => {
            onChange(r);
            // Se cierra solo al completar el rango: con el inicio marcado aún falta la mitad.
            if (r?.from && r.to && r.from.getTime() !== r.to.getTime()) setAbierto(false);
          }}
          disabled={[{ after: hoy }, ...(limite ? [limite] : [])]}
        />
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Hasta {MAX_DIAS_RANGO} días. Los días se cuentan en la zona horaria de tu empresa.
        </p>
      </PopoverContent>
    </Popover>
  );
}

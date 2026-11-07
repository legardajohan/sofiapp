import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDescargarPendientesPdf } from '../hooks/useDescargarPendientesPdf.js';
import { aDiaCivil, problemaConRango, zonaDelNavegador } from '../lib/rango-pdf.js';

const formatoDia = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * «Descargar PDF» de la columna Pendientes (HU-PDF-01). Solo existe aquí: ninguna columna de etapa
 * lo monta (CA7).
 *
 * Un calendario en modo rango y no dos campos de fecha: el primer clic fija el inicio y el segundo
 * el final, que es el gesto natural para «del 1 al 31». El botón de descarga se queda deshabilitado
 * —con el motivo escrito debajo— hasta que el rango es válido (CA6).
 */
export function PendientesPdfPopover(): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const [rango, setRango] = useState<DateRange | undefined>();
  const descargar = useDescargarPendientesPdf();

  const problema = problemaConRango(rango?.from, rango?.to);

  function handleDescargar(): void {
    if (problema || !rango?.from || !rango.to) return;
    descargar.mutate(
      { desde: aDiaCivil(rango.from), hasta: aDiaCivil(rango.to), tz: zonaDelNavegador() },
      { onSuccess: () => setAbierto(false) },
    );
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97]"
          title="Descargar los pendientes de un rango de fechas en PDF"
        >
          <FileDown className="size-3.5" aria-hidden="true" />
          Descargar PDF
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Reporte de pendientes</p>
          <p className="text-xs text-muted-foreground">
            Elige el día inicial y el final. Se incluyen los pendientes creados en ese rango.
          </p>
        </div>

        <Calendar
          mode="range"
          locale={es}
          selected={rango}
          onSelect={setRango}
          defaultMonth={rango?.from}
          className="px-2"
        />

        <div className="space-y-2 border-t border-border px-4 py-3">
          <p className="text-xs tabular-nums text-foreground" aria-live="polite">
            {rango?.from ? formatoDia.format(rango.from) : 'Inicio'}
            {' – '}
            {rango?.to ? formatoDia.format(rango.to) : 'Final'}
          </p>
          {problema && rango?.from && (
            <p role="alert" className="text-xs text-destructive">
              {problema}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            className="w-full motion-safe:active:scale-[0.98]"
            disabled={problema !== null || descargar.isPending}
            onClick={handleDescargar}
            title={problema ?? undefined}
          >
            {descargar.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Generando PDF…
              </>
            ) : (
              <>
                <FileDown className="size-4" aria-hidden="true" />
                Descargar PDF
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

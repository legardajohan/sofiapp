import { useMemo } from 'react';
import { Check } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateAjustesTenant } from './hooks/useAjustesTenant.js';

interface Props {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  actual: string;
}

/** Zonas IANA que conoce el navegador. Lista estática por sesión: se calcula una vez. */
function zonasDisponibles(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Santiago', 'UTC'];
  }
}

/**
 * Zona horaria de la empresa (HU-MARK-07). Con ella se cuentan los días de un rango personalizado:
 * «del 1 al 7» empieza a las 00:00 de aquí, no de donde esté quien abre la pantalla.
 *
 * Buscador y no un `Select`: son cientos de zonas, y nadie recorre una lista así con la rueda.
 */
export function ZonaHorariaDialog({ open, onOpenChange, actual }: Props): React.ReactElement {
  const zonas = useMemo(zonasDisponibles, []);
  const guardar = useUpdateAjustesTenant();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zona horaria de tu empresa</DialogTitle>
          <DialogDescription>
            Define cuándo empieza y termina cada día en las audiencias por fechas. Aplica a todo tu
            equipo.
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-lg border border-border">
          <CommandInput placeholder="Buscar ciudad o región" />
          <CommandList className="max-h-72">
            <CommandEmpty>No hay ninguna zona con ese nombre.</CommandEmpty>
            {zonas.map((z) => (
              <CommandItem
                key={z}
                value={z}
                disabled={guardar.isPending}
                onSelect={() =>
                  guardar.mutate({ zonaHoraria: z }, { onSuccess: () => onOpenChange(false) })
                }
                className="gap-2"
              >
                <span className="truncate">{z.replace(/_/g, ' ')}</span>
                {z === actual ? <Check aria-hidden className="ml-auto h-4 w-4 text-primary" /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

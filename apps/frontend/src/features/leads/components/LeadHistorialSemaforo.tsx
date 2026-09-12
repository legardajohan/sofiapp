import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHistorialSemaforo } from '../hooks/useHistorialSemaforo.js';
import { COLOR_ESTADO_DESCONOCIDO, fechaLarga } from '../lib/format.js';
import type { SemaforoDTO } from '../../semaforos/types.js';
import type { HistorialSemaforoDTO } from '../types.js';

interface Props {
  leadId: string;
  /** Catálogo del tenant, para resolver cada `key` del historial a su etiqueta y su color. */
  semaforos: SemaforoDTO[];
}

/**
 * Un extremo de la transición. Una `key` que ya no está en el catálogo se pinta cruda antes que
 * como un hueco: el cambio ocurrió, y esconderlo sería mentir sobre el historial.
 */
function Extremo({
  clave,
  semaforos,
}: {
  clave: string | null;
  semaforos: SemaforoDTO[];
}): React.ReactElement {
  if (clave === null) {
    return <span className="text-muted-foreground">Sin clasificar</span>;
  }

  const semaforo = semaforos.find((s) => s.key === clave);

  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: semaforo?.color ?? COLOR_ESTADO_DESCONOCIDO }}
      />
      <span className="text-foreground">{semaforo?.label ?? clave}</span>
    </span>
  );
}

function Entrada({
  cambio,
  semaforos,
}: {
  cambio: HistorialSemaforoDTO;
  semaforos: SemaforoDTO[];
}): React.ReactElement {
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Extremo clave={cambio.de} semaforos={semaforos} />
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Extremo clave={cambio.a} semaforos={semaforos} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {cambio.actor?.nombre ?? 'Un usuario'} · {fechaLarga(cambio.at)}
      </p>
    </li>
  );
}

/**
 * Historial de cambios de semáforo del lead (HU-CRM-04).
 *
 * Cerrado por defecto y con la consulta atada a la apertura: es información que se consulta cuando
 * algo no cuadra, no parte de la lectura principal de la ficha, y no tiene por qué costarle una
 * petición a quien nunca la abre.
 */
export function LeadHistorialSemaforo({ leadId, semaforos }: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const historial = useHistorialSemaforo(leadId, abierto);

  return (
    <Accordion
      type="single"
      collapsible
      value={abierto ? 'historial' : ''}
      onValueChange={(v) => setAbierto(v === 'historial')}
    >
      <AccordionItem value="historial" className="border-b-0">
        <AccordionTrigger className="py-2 text-sm font-semibold text-foreground hover:no-underline">
          Historial del semáforo
        </AccordionTrigger>
        <AccordionContent>
          {historial.isLoading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : historial.isError ? (
            <div className="py-1">
              <p className="text-sm text-destructive">No se pudo cargar el historial.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void historial.refetch()}
              >
                Reintentar
              </Button>
            </div>
          ) : historial.data && historial.data.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {historial.data.data.map((cambio) => (
                <Entrada key={cambio.id} cambio={cambio} semaforos={semaforos} />
              ))}
            </ul>
          ) : (
            // Un hueco vacío deja al usuario preguntándose si falló algo. Se explica para qué sirve
            // la sección en vez de encogerse de hombros.
            <p className="text-sm text-muted-foreground">
              Todavía no se ha cambiado el semáforo de este lead. Cada cambio queda registrado con
              su autor y su fecha.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

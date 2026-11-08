import { useState } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type GravedadNodo = 'error' | 'pendiente';

interface ProblemaNodoProps {
  gravedad: GravedadNodo;
  problemas: string[];
}

/**
 * Icono de estado de un nodo con algo por corregir. El «por qué» no ocupa lugar en el nodo: sale al
 * pasar el cursor o al hacer clic (y con el teclado, al enfocar y pulsar Enter). Ámbar = el nodo está
 * incompleto (falta configurar); rojo = algo roto (un enlace sin destino o un error del servidor).
 */
export function ProblemaNodo({ gravedad, problemas }: ProblemaNodoProps): React.ReactElement {
  const [fijo, setFijo] = useState(false);
  const [encima, setEncima] = useState(false);
  const esError = gravedad === 'error';
  const Icono = esError ? AlertCircle : AlertTriangle;
  const etiqueta = esError ? 'Con errores' : 'Falta configurar';

  return (
    <Popover
      open={fijo || encima}
      onOpenChange={(abierto) => {
        setFijo(abierto);
        if (!abierto) setEncima(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // `nodrag`: pulsar el icono no debe arrastrar ni seleccionar el nodo por error.
          className="nodrag nopan rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={etiqueta}
          onMouseEnter={() => setEncima(true)}
          onMouseLeave={() => setEncima(false)}
        >
          <Icono
            className={cn(
              'h-4 w-4',
              esError ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-64 space-y-1.5 p-3 text-xs"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setEncima(true)}
        onMouseLeave={() => setEncima(false)}
      >
        <p className="font-medium text-foreground">{etiqueta}</p>
        <ul className="space-y-1 text-muted-foreground">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

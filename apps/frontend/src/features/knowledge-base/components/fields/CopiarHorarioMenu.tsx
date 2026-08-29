import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Los días que cubre el atajo «Lunes a viernes». */
const LABORALES: readonly string[] = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

interface DiaDestino {
  dia: string;
  cerrado: boolean;
}

interface CopiarHorarioMenuProps {
  /** Día del que se copia. */
  dia: string;
  /** Los otros seis, con su estado. */
  otrosDias: readonly DiaDestino[];
  onCopiar: (destinos: readonly string[]) => void;
  /** Un día sin tramos no tiene nada que copiar. */
  disabled?: boolean;
}

/**
 * Copiar el horario de un día a varios de una vez.
 *
 * **Es un `DropdownMenu` con casillas, y no un `Select`**, porque esto ejecuta una acción sobre
 * varios destinos: un `Select` sirve para elegir *un valor* y mentiría sobre lo que hace. Tampoco es
 * una lista de casillas siempre visible —seis por día son 42 controles en una UI cuyo objetivo es
 * caber en una pantalla— ni un simple «aplicar a toda la semana», que se queda corto para el caso
 * más común del comercio: lunes a viernes.
 *
 * **Los días cerrados aparecen deshabilitados**, no se saltan en silencio. Cerrar un día es una
 * decisión explícita del admin, y enterarse *después* de que su selección se ignoró es peor que no
 * poder elegirlo.
 */
export function CopiarHorarioMenu({
  dia,
  otrosDias,
  onCopiar,
  disabled = false,
}: CopiarHorarioMenuProps): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<readonly string[]>([]);

  const copiables = otrosDias.filter((d) => !d.cerrado).map((d) => d.dia);

  function alternar(destino: string): void {
    setSeleccion((actual) =>
      actual.includes(destino) ? actual.filter((d) => d !== destino) : [...actual, destino],
    );
  }

  function aplicar(destinos: readonly string[]): void {
    if (destinos.length === 0) return;
    onCopiar(destinos);
    setSeleccion([]);
    setAbierto(false);
  }

  return (
    <DropdownMenu
      open={abierto}
      onOpenChange={(siguiente) => {
        setAbierto(siguiente);
        // Cerrar sin copiar descarta la selección: al volver a abrir se empieza limpio, que es lo
        // que espera quien se arrepintió a medias.
        if (!siguiente) setSeleccion([]);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-xs" disabled={disabled}>
          <Copy className="size-3.5" aria-hidden="true" />
          Copiar a…
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          Copiar el horario del {dia} a
        </DropdownMenuLabel>

        <DropdownMenuItem
          onSelect={() => aplicar(copiables.filter((d) => LABORALES.includes(d)))}
          disabled={!copiables.some((d) => LABORALES.includes(d))}
        >
          Lunes a viernes
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => aplicar(copiables)} disabled={copiables.length === 0}>
          Toda la semana
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {otrosDias.map((destino) => (
          <DropdownMenuCheckboxItem
            key={destino.dia}
            checked={seleccion.includes(destino.dia)}
            disabled={destino.cerrado}
            // Sin esto, marcar una casilla cerraría el menú y elegir varios días sería imposible.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => alternar(destino.dia)}
            className="capitalize"
          >
            <span className="flex-1">{destino.dia}</span>
            {destino.cerrado && (
              <span className="ml-2 text-xs normal-case text-muted-foreground">cerrado</span>
            )}
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />

        <div className="p-1">
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={seleccion.length === 0}
            onClick={() => aplicar(seleccion)}
          >
            Copiar{seleccion.length > 0 && ` (${seleccion.length})`}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

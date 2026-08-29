import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GAMA_OPCIONES, nombreDeColor } from '../lib/option-color.js';

interface Props {
  value: string;
  onChange: (hex: string) => void;
  disabled: boolean;
  /** Nombre de la opción, para que el botón diga qué está coloreando. */
  etiqueta: string;
}

/**
 * Elige el color de una opción del catálogo.
 *
 * La gama se despliega **en línea**, bajo la fila, en vez de en un popover. No es una preferencia
 * estética: este control vive dentro del diálogo modal de edición, y un overlay dentro de otro
 * overlay pelea por el foco y por el `Escape` con el diálogo que lo contiene. Desplegar en el sitio
 * es además el patrón que ya usa este mismo panel para las opciones archivadas, así que el gesto se
 * repite en vez de introducir uno nuevo.
 *
 * El disparador es la propia muestra de color: el control y su estado actual son la misma cosa, así
 * que no hace falta explicar cuál es el color de la fila.
 */
export function ColorOpcionPicker({
  value,
  onChange,
  disabled,
  etiqueta,
}: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const normalizado = value.toUpperCase();
  const panelId = `gama-${etiqueta.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={`Color de ${etiqueta}: ${nombreDeColor(normalizado)}`}
        aria-expanded={abierto}
        aria-controls={panelId}
        title={`Color: ${nombreDeColor(normalizado)}`}
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          'h-8 w-8 shrink-0 rounded-md border border-input p-1.5 ring-offset-background',
          'transition-transform duration-150 ease-out motion-safe:active:scale-[0.94]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <span
          className="block h-full w-full rounded-sm ring-1 ring-inset ring-black/10"
          style={{ backgroundColor: normalizado }}
        />
      </button>

      {abierto && (
        <div
          id={panelId}
          role="group"
          aria-label={`Gama de colores de ${etiqueta}`}
          className={cn(
            'absolute left-0 top-9 z-20 w-max rounded-md border border-border bg-popover p-2 shadow-md',
            'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150',
          )}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {GAMA_OPCIONES.map((opcion) => {
              const activo = opcion.hex === normalizado;
              return (
                <button
                  key={opcion.hex}
                  type="button"
                  onClick={() => {
                    onChange(opcion.hex);
                    // Se cierra al elegir: la decisión está tomada y dejarlo abierto solo taparía
                    // la fila siguiente.
                    setAbierto(false);
                  }}
                  aria-label={opcion.nombre}
                  aria-pressed={activo}
                  title={opcion.nombre}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full ring-offset-background',
                    'transition-transform duration-150 ease-out motion-safe:active:scale-[0.94]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    activo && 'ring-2 ring-ring ring-offset-2',
                  )}
                  style={{ backgroundColor: opcion.hex }}
                >
                  {activo && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

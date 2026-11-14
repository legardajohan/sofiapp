import { useState } from 'react';
import { BellRing, ChevronDown, ChevronUp, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAvisosActivos, useRecordatoriosActivos } from '../hooks/useOrganizador.js';
import { RecordatorioCard } from './RecordatorioCard.js';

const CLAVE_MINIMIZADA = 'sofiapp:organizador:pila-minimizada';

/** Minimizar es una comodidad de esta pestaña, no una resolución: vive en `sessionStorage`. */
function leerMinimizada(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_MINIMIZADA) === '1';
  } catch {
    return false;
  }
}

function guardarMinimizada(valor: boolean): void {
  try {
    sessionStorage.setItem(CLAVE_MINIMIZADA, valor ? '1' : '0');
  } catch {
    // Almacenamiento bloqueado: se minimiza igual, solo que no se recuerda.
  }
}

/**
 * Pila de recordatorios vencidos (HU-PDF-02 §4.2). Montada una vez en `AppLayout`, visible en
 * cualquier pantalla.
 *
 * **Persistente sin ser un modal.** No tiene temporizador, no se cierra con clic fuera ni con Esc,
 * y no ofrece «descartar»: un recordatorio solo se va cerrándolo o posponiéndolo. Para no tapar el
 * CRM muestra el primero y despliega el resto bajo demanda, y se puede **minimizar** a una píldora
 * con el contador — que nunca desaparece mientras quede algo pendiente.
 *
 * Arriba a la derecha, no abajo: abajo a la derecha viven los toasts de sonner, y los dos apilados
 * se taparían.
 */
export function RecordatoriosStack(): React.ReactElement | null {
  const habilitado = useAvisosActivos();
  const { data } = useRecordatoriosActivos();
  const [minimizada, setMinimizada] = useState(leerMinimizada);
  const [expandida, setExpandida] = useState(false);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  if (!habilitado || total === 0) return null;

  const etiqueta = total === 1 ? '1 recordatorio pendiente' : `${total} recordatorios pendientes`;

  function minimizar(valor: boolean): void {
    setMinimizada(valor);
    guardarMinimizada(valor);
  }

  if (minimizada) {
    return (
      <div className="fixed right-4 top-16 z-40 md:top-4">
        <Button
          type="button"
          onClick={() => minimizar(false)}
          aria-label={`${etiqueta}. Mostrar`}
          className="h-9 gap-2 rounded-full bg-warning pl-3 pr-4 text-warning-foreground shadow-lg hover:bg-warning/90 motion-safe:active:scale-[0.97]"
        >
          <BellRing className="size-4" aria-hidden="true" />
          <span className="tabular-nums">{total}</span>
        </Button>
      </div>
    );
  }

  const [primero, ...resto] = items;

  return (
    <aside
      role="region"
      aria-label="Recordatorios pendientes"
      aria-live="polite"
      // Fondo opaco de tarjeta + un velo naranja muy tenue encima (wrapper interno): se distingue de
      // los popovers y toasts sin gritar, y no deja ver la página a través en ningún tema.
      className="fixed right-4 top-16 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-warning/25 bg-card text-card-foreground shadow-lg md:top-4"
    >
      <div className="bg-warning-subtle/50">
        <header className="flex items-center gap-2 border-b border-warning/15 px-3 py-2">
          <BellRing className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="flex-1 truncate text-sm font-medium">{etiqueta}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Minimizar recordatorios"
            title="Minimizar: seguirán pendientes"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={() => minimizar(true)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button>
        </header>

        {primero && (
          // `key` por id: un recordatorio que llega o que reemplaza al que se gestionó entra con su
          // propio fundido corto, que es justo lo que dice «esto es nuevo».
          <div
            key={primero.id}
            className="motion-safe:duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2"
          >
            <RecordatorioCard recordatorio={primero} />
          </div>
        )}

        {resto.length > 0 && (
          <>
            <Separator className="bg-warning/15" />
            {expandida && (
              <ScrollArea className="max-h-[50vh]">
                {resto.map((r) => (
                  <div key={r.id} className="border-b border-warning/15 last:border-b-0">
                    <RecordatorioCard recordatorio={r} />
                  </div>
                ))}
              </ScrollArea>
            )}
            <button
              type="button"
              onClick={() => setExpandida((v) => !v)}
              aria-expanded={expandida}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-warning-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                expandida && 'border-t border-warning/15',
              )}
            >
              {expandida ? (
                <>
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  Ver {total - 1} más
                </>
              )}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { cuandoAbre } from '../lib/formato.js';
import { CATEGORIAS_ENVIO, CATEGORIA_INFO, type EstadoCategoria, type SendWindowStatus } from '../types.js';

function textoEstado(e: EstadoCategoria, zona: string): string {
  if (e.permitido) {
    return e.siguienteCierre ? `Abierto hasta ${cuandoAbre(e.siguienteCierre, zona)}` : 'Sin restricción';
  }
  return e.siguienteApertura
    ? `Cerrado, abre ${cuandoAbre(e.siguienteApertura, zona)}`
    : 'Cerrado en las próximas dos semanas';
}

interface Props {
  status: SendWindowStatus | undefined;
  cargando: boolean;
}

/**
 * Qué puede salir ahora mismo, según lo GUARDADO (no lo que se está editando). Cerrado no se pinta
 * en rojo: fuera de horario es el funcionamiento normal, no un error.
 */
export function EstadoActualStrip({ status, cargando }: Props): React.ReactElement | null {
  if (cargando) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (!status) return null;

  if (!status.activo) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        Con los horarios desactivados, todos los mensajes salen a cualquier hora.
      </p>
    );
  }

  return (
    <section aria-labelledby="estado-actual" className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h2 id="estado-actual" className="text-sm font-medium text-secondary-foreground">
        Ahora mismo
      </h2>
      <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIAS_ENVIO.map((c) => {
          const e = status.categorias[c];
          return (
            <li key={c} className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  e.permitido ? 'bg-success' : 'bg-muted-foreground/50',
                )}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{CATEGORIA_INFO[c].nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {textoEstado(e, status.zonaHoraria)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

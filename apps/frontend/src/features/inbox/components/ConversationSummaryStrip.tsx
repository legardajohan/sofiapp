import { ChevronDown, Loader2, Lock, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MOTIVO_DATOS_SENSIBLES } from '@/lib/roles';
import { shortTime } from '../lib/format.js';
import type { ResumenDTO } from '../types.js';

interface Props {
  resumen: ResumenDTO | null;
  /** Del servidor, no de una comprobación de rol local: la UI oculta lo que el backend decide. */
  puedeVer: boolean;
  puedeGenerar: boolean;
  expandido: boolean;
  onToggle: () => void;
  pending: boolean;
  onGenerate: () => void;
}

/** Franja de la columna central, con el mismo alto y padding que la de etiquetas. */
const BANDA = 'flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-2';

/**
 * El resumen de la conversación, sobre el hilo (HU-IA-04).
 *
 * Antes vivía en la ficha del contacto, tercera columna y colapsada por defecto: había que abrirla
 * y pasar cinco tarjetas para leer tres frases que son justo lo que hace falta ANTES de contestar.
 * Aquí está en el camino de los ojos, y no en el de las manos.
 *
 * Se mantiene deliberadamente callada —tokens neutros, un solo acento— porque el hilo es el
 * protagonista de esta pantalla. La banda acompaña; no compite.
 */
export function ConversationSummaryStrip({
  resumen,
  puedeVer,
  puedeGenerar,
  expandido,
  onToggle,
  pending,
  onGenerate,
}: Props): React.ReactElement {
  // Vedado: no es un hueco ni un error, es una explicación. Distinguir "no hay resumen" de "no
  // puedes verlo" es requisito, no matiz (ADR-0006 §4).
  if (!puedeVer) {
    return (
      <div className={BANDA}>
        <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">{MOTIVO_DATOS_SENSIBLES}</p>
      </div>
    );
  }

  if (pending) {
    return (
      <div className={BANDA} aria-busy="true" aria-label="Generando el resumen">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      </div>
    );
  }

  // Sin resumen todavía: una pantalla vacía es una invitación a actuar, no un aviso de carencia.
  if (!resumen) {
    return (
      <div className={cn(BANDA, 'items-center')}>
        <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <p className="flex-1 text-xs text-muted-foreground">
          Genera un resumen para saber de qué va la conversación sin leerla entera.
        </p>
        {puedeGenerar && (
          <Button variant="outline" size="sm" className="h-6 shrink-0 text-xs" onClick={onGenerate}>
            Generar resumen
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={BANDA}>
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        {/* La banda entera es el control: un objetivo de un renglón completo en vez de un enlace
            de dos palabras. `text-left` porque un <button> centra por defecto. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expandido}
          className="w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <p
            className={cn(
              'text-xs leading-relaxed text-secondary-foreground',
              !expandido && 'line-clamp-2',
            )}
          >
            {resumen.texto}
          </p>
        </button>

        {expandido && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              Generado {shortTime(resumen.generadoAt)}
            </span>
            {puedeGenerar && (
              <button
                type="button"
                onClick={onGenerate}
                className="text-[11px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {resumen.desactualizado ? 'Actualizar' : 'Regenerar'}
              </button>
            )}
          </div>
        )}
      </div>

      {resumen.desactualizado && (
        <Badge variant="secondary" className="shrink-0 font-normal">
          Desactualizado
        </Badge>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expandido}
        aria-label={expandido ? 'Contraer el resumen' : 'Ver el resumen completo'}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {/* Solo rota el chevron. La altura NO se anima: un salto de layout justo encima del hilo,
            que además hace autoscroll al final, se lee peor que un cambio seco. */}
        <ChevronDown
          className={cn(
            'size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none',
            expandido && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/** Marcador de carga del propio overview, mientras no se sabe si hay resumen ni si se puede ver. */
export function ConversationSummaryStripSkeleton(): React.ReactElement {
  return (
    <div className={BANDA} aria-busy="true" aria-label="Cargando el resumen">
      <Loader2
        className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
        aria-hidden="true"
      />
      <Skeleton className="h-2.5 w-48" />
    </div>
  );
}

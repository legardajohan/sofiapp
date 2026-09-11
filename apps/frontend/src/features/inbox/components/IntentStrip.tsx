import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TagChip } from '@/features/tags/components/TagChip';
import { cn } from '@/lib/utils';
import { shortTime } from '../lib/format.js';
import type { SemaforoIADTO } from '../types.js';

interface Props {
  semaforoIA: SemaforoIADTO | null;
  pending: boolean;
  onApply: () => void;
}

/** El mismo alto y padding que la tira de resumen y la de etiquetas: las tres se leen como un bloque. */
const BANDA = 'flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2';

/**
 * La intención de compra que detectó Sofi, sobre el hilo (HU-IA-05).
 *
 * Es la tercera banda bajo la cabecera, así que se gana el sitio con **restricción**: una sola
 * línea y **nada** cuando no hay clasificación. La tira de resumen merece cuatro estados porque el
 * usuario la dispara; esta es ambiente —aparece sola tras un mensaje del cliente—, y un estado
 * vacío que dijera "todavía sin clasificar" sería una fila de ruido permanente en cada
 * conversación nueva.
 *
 * **La confianza no se pinta como porcentaje.** «72 %» es falsa precisión: no le dice al asesor qué
 * hacer distinto, y compite por atención con el motivo, que sí. El número vive en el `title` del
 * chip y en la bitácora de clasificaciones.
 *
 * El color sale de la base de datos, así que pasa por `TagChip` —único componente autorizado a
 * pintarlo— y por tanto conserva el nombre y el color que el admin le haya puesto a la etiqueta.
 */
export function IntentStrip({ semaforoIA, pending, onApply }: Props): React.ReactElement | null {
  // Sin clasificación no hay banda. Nada que mostrar no es lo mismo que un hueco que mostrar.
  if (!semaforoIA) return null;
  // La etiqueta se borró desde /etiquetas: sin chip que pintar, la sugerencia no significa nada
  // para el asesor y no se puede aplicar. El dato sigue vivo en la bitácora.
  if (!semaforoIA.tag) return null;

  const { tag, motivo, confianza, pendiente, at } = semaforoIA;

  return (
    <div className={cn(BANDA)} role="group" aria-label="Intención de compra detectada por Sofi">
      <Gauge className="size-3.5 shrink-0 text-primary" aria-hidden="true" />

      {/* El `title` va en un envoltorio y no en `TagChip`: añadirle una prop a un componente que se
          pinta decenas de veces en la bandeja, para un tooltip que solo necesita esta banda, sería
          ensanchar su API por un caso. La cifra exacta queda al alcance de quien la busque, sin
          ocupar sitio en la línea. */}
      <span
        className="shrink-0"
        title={`Confianza de la clasificación: ${Math.round(confianza * 100)} %`}
      >
        <TagChip tag={tag} />
      </span>

      {motivo && (
        <p className="min-w-0 flex-1 truncate text-xs text-secondary-foreground" title={motivo}>
          {motivo}
        </p>
      )}

      {pendiente ? (
        <Button
          variant="outline"
          size="sm"
          className="h-6 shrink-0 text-xs"
          disabled={pending}
          // Nombra la etiqueta destino: "Aplicar" a secas no dice qué va a pasar.
          aria-label={`Aplicar la etiqueta ${tag.nombre}`}
          onClick={onApply}
        >
          {pending ? 'Aplicando…' : 'Aplicar'}
        </Button>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(at)}</span>
      )}
    </div>
  );
}

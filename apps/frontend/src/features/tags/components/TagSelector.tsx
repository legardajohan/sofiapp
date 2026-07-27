import { useMemo } from 'react';
import { Check, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTags } from '../hooks/useTags.js';
import { TagChip } from './TagChip.js';
import type { TagDTO } from '../types.js';

interface Props {
  /** Etiquetas actualmente aplicadas a la conversación. */
  aplicadas: TagDTO[];
  pending: boolean;
  /** Recibe el conjunto completo resultante: el backend reemplaza, no acumula. */
  onChange: (tagIds: string[]) => void;
}

/**
 * Selector multi-etiqueta de la cabecera de la conversación.
 *
 * Va sobre `DropdownMenu` (Radix) y no sobre un panel `absolute` propio: la bandeja apila varios
 * contenedores con `overflow-hidden`/`auto`, dentro de los cuales un menú posicionado en absoluto
 * queda recortado. Radix lo renderiza en un portal, así que escapa del stacking context.
 *
 * Marcar y desmarcar no lleva transición: es una acción repetida y cualquier retardo se percibe
 * como lentitud. La animación queda solo en la apertura del menú, que sí es un cambio de contexto.
 */
export function TagSelector({ aplicadas, pending, onChange }: Props): React.ReactElement {
  const { data: disponibles, isLoading } = useTags();

  const aplicadasIds = useMemo(() => new Set(aplicadas.map((t) => t.id)), [aplicadas]);

  function alternar(tagId: string): void {
    const siguiente = new Set(aplicadasIds);
    if (siguiente.has(tagId)) siguiente.delete(tagId);
    else siguiente.add(tagId);
    onChange([...siguiente]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={aplicadas.length > 0 ? 'secondary' : 'ghost'}
          size="icon"
          disabled={pending}
          aria-label={
            aplicadas.length > 0
              ? `Etiquetas (${aplicadas.length} aplicadas)`
              : 'Etiquetar conversación'
          }
          title="Etiquetas"
          className="transition-[transform,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]"
        >
          <TagIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Etiquetas de la conversación
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">Cargando…</p>
        ) : (disponibles?.length ?? 0) === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Aún no hay etiquetas. Créalas en Etiquetas.
          </p>
        ) : (
          disponibles?.map((tag) => {
            const activa = aplicadasIds.has(tag.id);
            return (
              <DropdownMenuItem
                key={tag.id}
                // `preventDefault` mantiene el menú abierto: etiquetar suele ser aplicar varias
                // seguidas, y cerrarlo en cada clic obligaría a reabrirlo una y otra vez.
                onSelect={(e) => {
                  e.preventDefault();
                  alternar(tag.id);
                }}
                className="gap-2"
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', !activa && 'invisible')} />
                <TagChip tag={tag} className="min-w-0" />
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

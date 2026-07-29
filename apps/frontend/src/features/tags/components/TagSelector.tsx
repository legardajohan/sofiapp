import { useMemo, useRef, useState } from 'react';
import { Check, Plus, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useCreateTag, useTags } from '../hooks/useTags.js';
import { TagChip } from './TagChip.js';
import { TagFormDialog } from './TagFormDialog.js';
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
  const crear = useCreateTag();
  const [crearOpen, setCrearOpen] = useState(false);
  const abriendoDialogo = useRef(false);

  const aplicadasIds = useMemo(() => new Set(aplicadas.map((t) => t.id)), [aplicadas]);

  function alternar(tagId: string): void {
    const siguiente = new Set(aplicadasIds);
    if (siguiente.has(tagId)) siguiente.delete(tagId);
    else siguiente.add(tagId);
    onChange([...siguiente]);
  }

  /**
   * Crear desde aquí implica aplicar: si el asesor necesita una etiqueta que no existe es porque
   * la quiere en ESTA conversación. Obligarle a crearla y luego marcarla sería un paso de más.
   */
  function crearYAplicar(valores: { nombre: string; color: string }): void {
    crear.mutate(valores, {
      onSuccess: (tag) => {
        onChange([...aplicadasIds, tag.id]);
        setCrearOpen(false);
      },
    });
  }

  return (
    <>
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

        <DropdownMenuContent
          align="end"
          className="w-60"
          // Al cerrarse, Radix devuelve el foco al botón de etiquetas. Si el cierre viene de
          // "Crear etiqueta…" eso se lo robaría al campo Nombre del diálogo que se está abriendo,
          // y el asesor tendría que ir al campo con el ratón. En cualquier otro cierre (Esc, clic
          // fuera) sí queremos el comportamiento normal.
          onCloseAutoFocus={(e) => {
            if (!abriendoDialogo.current) return;
            abriendoDialogo.current = false;
            e.preventDefault();
          }}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Etiquetas de la conversación
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    abriendoDialogo.current = true;
                    setCrearOpen(true);
                  }}
                  aria-label="Crear etiqueta"
                  className="-mr-0.5 flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-[color,background-color] duration-150 ease-out hover:bg-muted hover:text-foreground motion-safe:active:scale-[0.92] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                Crear etiqueta
              </TooltipContent>
            </Tooltip>
          </div>
          <DropdownMenuSeparator />

          {isLoading ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Cargando…</p>
          ) : (disponibles?.length ?? 0) === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Aún no hay etiquetas. Crea la primera aquí arriba.
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

      {/* Fuera del DropdownMenu a propósito: dentro se desmontaría al cerrarse el menú. */}
      <TagFormDialog
        tag={null}
        open={crearOpen}
        pending={crear.isPending}
        onOpenChange={setCrearOpen}
        onSubmit={crearYAplicar}
      />
    </>
  );
}

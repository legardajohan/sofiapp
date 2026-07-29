import { useState } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TagChip } from '../components/TagChip.js';
import { TagFormDialog } from '../components/TagFormDialog.js';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '../hooks/useTags.js';
import type { TagDTO } from '../types.js';

const SEMAFORO_AYUDA: Record<string, string> = {
  verde: 'La conversación progresa',
  naranja: 'Estancada o con una objeción pendiente',
  rojo: 'Bloqueada, a punto de perderse',
  azul: 'Consulta general, sin intención comercial aún',
};

function Fila({
  tag,
  onEdit,
  onDelete,
}: {
  tag: TagDTO;
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const esSemaforo = tag.semaforo !== null;

  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <TagChip tag={tag} />
        {esSemaforo && (
          <p className="mt-1 text-xs text-muted-foreground">
            Semaforización · {SEMAFORO_AYUDA[tag.semaforo!] ?? ''}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`Editar la etiqueta ${tag.nombre}`}
          className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.95]"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {/* Todas se pueden borrar, incluidas las de semaforización. Las de sistema pasan antes por
            una confirmación, porque su borrado afecta a módulos que no están a la vista. */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={`Eliminar la etiqueta ${tag.nombre}`}
          className="text-muted-foreground transition-[transform,color] duration-150 ease-out hover:text-destructive motion-safe:active:scale-[0.95]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

/**
 * Confirmación para las etiquetas de semaforización. No la pedimos para las normales: ahí el
 * borrado es del propio administrador sobre algo que él creó, y un diálogo por cada una sería
 * fricción sin información nueva. Una de semáforo, en cambio, la usan otros módulos del producto,
 * y ese efecto no se ve desde esta pantalla — es justo lo que el diálogo aporta.
 */
function ConfirmarBorradoSemaforo({
  tag,
  pending,
  onOpenChange,
  onConfirm,
}: {
  tag: TagDTO | null;
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <AlertDialog open={tag !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar «{tag?.nombre}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Es una etiqueta de semaforización. Los informes y la clasificación automática dejarán de
            usarla, y se quitará de todas las conversaciones que la tengan. Podrás volver a crearla,
            pero como una etiqueta normal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              // El cierre lo decide la mutación: si el backend falla, el diálogo sigue abierto con
              // el error en el toast, en vez de desaparecer como si hubiera funcionado.
              e.preventDefault();
              onConfirm();
            }}
            className={cn(
              buttonVariants({ variant: 'destructive' }),
              'transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]',
            )}
          >
            {pending ? 'Eliminando…' : 'Eliminar etiqueta'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TagsPage(): React.ReactElement {
  const { data: tags, isLoading } = useTags();
  const crear = useCreateTag();
  const actualizar = useUpdateTag();
  const borrar = useDeleteTag();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<TagDTO | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<TagDTO | null>(null);

  function pedirBorrado(tag: TagDTO): void {
    if (tag.semaforo !== null) {
      setPorConfirmar(tag);
      return;
    }
    borrar.mutate(tag.id);
  }

  function confirmarBorrado(): void {
    if (!porConfirmar) return;
    borrar.mutate(porConfirmar.id, { onSuccess: () => setPorConfirmar(null) });
  }

  function abrirCrear(): void {
    setEditando(null);
    setDialogOpen(true);
  }

  function abrirEditar(tag: TagDTO): void {
    setEditando(tag);
    setDialogOpen(true);
  }

  function guardar(valores: { nombre: string; color: string }): void {
    if (editando) {
      actualizar.mutate(
        { id: editando.id, payload: valores },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      crear.mutate(valores, { onSuccess: () => setDialogOpen(false) });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground">Etiquetas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clasifica las conversaciones de la bandeja y fíltralas por su estado o interés comercial.
          </p>
        </div>
        <Button
          onClick={abrirCrear}
          className="shrink-0 transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Crear etiqueta
        </Button>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (tags?.length ?? 0) === 0 ? (
          // Estado vacío como invitación a actuar, no como cartel de "no hay datos". En la
          // práctica no se alcanza: las cuatro de semaforización se siembran por empresa.
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Tags className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Todavía no hay etiquetas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea la primera para empezar a clasificar tus conversaciones.
              </p>
            </div>
            <Button variant="outline" onClick={abrirCrear}>
              <Plus className="h-4 w-4" />
              Crear etiqueta
            </Button>
          </div>
        ) : (
          <ul>
            {tags?.map((tag) => (
              <Fila
                key={tag.id}
                tag={tag}
                onEdit={() => abrirEditar(tag)}
                onDelete={() => pedirBorrado(tag)}
              />
            ))}
          </ul>
        )}
      </div>

      <TagFormDialog
        tag={editando}
        open={dialogOpen}
        pending={crear.isPending || actualizar.isPending}
        onOpenChange={setDialogOpen}
        onSubmit={guardar}
      />

      <ConfirmarBorradoSemaforo
        tag={porConfirmar}
        pending={borrar.isPending}
        onOpenChange={(abierto) => {
          if (!abierto) setPorConfirmar(null);
        }}
        onConfirm={confirmarBorrado}
      />
    </div>
  );
}

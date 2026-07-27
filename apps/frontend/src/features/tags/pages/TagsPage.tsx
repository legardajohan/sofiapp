import { useState } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
        {/* Las de semaforización no ofrecen borrado: en vez de un botón deshabilitado sin
            explicación, el motivo se cuenta en la línea de ayuda de arriba. */}
        {!esSemaforo && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Eliminar la etiqueta ${tag.nombre}`}
            className="text-muted-foreground transition-[transform,color] duration-150 ease-out hover:text-destructive motion-safe:active:scale-[0.95]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function TagsPage(): React.ReactElement {
  const { data: tags, isLoading } = useTags();
  const crear = useCreateTag();
  const actualizar = useUpdateTag();
  const borrar = useDeleteTag();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<TagDTO | null>(null);

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
                onDelete={() => borrar.mutate(tag.id)}
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
    </div>
  );
}

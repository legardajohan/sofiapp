import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  createKbDocument,
  deleteKbDocument,
  updateKbDocument,
} from '../../../api/knowledge-base.js';
import { isTitleTaken, isVirtualPresetId } from '../lib/kb-presets.js';
import type { IKbDocument } from '../types/index.js';

const CONTENIDO_MAX = 3000;
const CONTENIDO_WARN = 2700; // 90% del tope: el contador vira a ámbar
const PLACEHOLDER_GENERICO = 'Escribe o pega aquí la información pertinente…';

/** Color del contador según cercanía al límite: neutro → ámbar (≥90%) → rojo (tope). */
function counterColor(length: number): string {
  if (length >= CONTENIDO_MAX) return 'text-destructive font-medium';
  if (length >= CONTENIDO_WARN) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

/** Mensaje del servidor si vino, o el de reserva. */
function errorMessage(err: unknown, fallback: string): string {
  const serverMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return serverMsg ?? fallback;
}

interface KnowledgeUploadEditorProps {
  /**
   * Documento a editar. Uno real → `PATCH`. Un preset **virtual** (id `__preset_*`, sin documento en
   * la base) → `POST` con el título ya fijado. Ausente → creación libre, con título editable.
   *
   * Se llama `doc` y no `document` para no ensombrecer el `document` global dentro del componente.
   */
  doc?: IKbDocument;
  /** Documentos reales del tenant: fuente de verdad para detectar títulos ya usados. */
  documents: IKbDocument[];
  /**
   * Contenido en edición. Vive en `KnowledgeDocumentDialog` porque el encabezado lo necesita para
   * anticipar la versión de destino mientras se escribe; aquí llega controlado.
   */
  contenido: string;
  onContenidoChange: (value: string) => void;
  /** Cierra el modal: guardado con éxito, borrado con éxito o cancelación. */
  onDone: () => void;
}

/**
 * Cuerpo del modal de conocimiento: campos, guardado e (cuando procede) borrado.
 *
 * El chrome —título fijo y leyenda de versión— lo pone `KnowledgeDocumentDialog`; aquí vive todo lo
 * que depende del estado de las mutaciones, incluido el botón Eliminar.
 */
export function KnowledgeUploadEditor({
  doc,
  documents,
  contenido,
  onContenidoChange,
  onDone,
}: KnowledgeUploadEditorProps): React.ReactElement {
  const queryClient = useQueryClient();

  // Un preset virtual todavía no existe en la base: llenarlo por primera vez es crear, no editar.
  const isVirtualPreset = doc !== undefined && isVirtualPresetId(doc.id);
  const isEdit = doc !== undefined && !isVirtualPreset;
  const tituloEditable = doc === undefined;

  const [titulo, setTitulo] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (vars: { titulo: string; contenido: string }): Promise<IKbDocument> =>
      isEdit && doc
        ? updateKbDocument(doc.id, { contenido: vars.contenido })
        : createKbDocument({ titulo: vars.titulo, contenido: vars.contenido }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'documents'] });
      toast.success(
        saved.contenido.trim().length === 0
          ? 'Guardado, sin contenido que indexar'
          : 'Guardado. Indexando su contenido…',
        { description: saved.titulo },
      );
      onDone();
    },
    onError: (err: Error) => {
      setErrorMsg(errorMessage(err, 'No se pudo guardar el contenido. Intenta de nuevo.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKbDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'documents'] });
      toast.success('Conocimiento eliminado', { description: doc?.titulo });
      onDone();
    },
    onError: (err: Error) => {
      setConfirmarBorrado(false);
      toast.error(errorMessage(err, 'No se pudo eliminar. Intenta de nuevo.'));
    },
  });

  const ocupado = saveMutation.isPending || deleteMutation.isPending;
  const tituloTrimmed = titulo.trim();
  // Solo aplica al crear: al editar, el título ya es de este documento y no se toca.
  const tituloDuplicado = tituloEditable && tituloTrimmed.length > 0 && isTitleTaken(tituloTrimmed, documents);

  // Al crear, el backend exige contenido; al editar, vaciar un documento es válido (queda pendiente).
  const contenidoListo = isEdit || contenido.trim().length > 0;
  const tituloListo = !tituloEditable || (tituloTrimmed.length > 0 && !tituloDuplicado);
  const puedeGuardar = contenidoListo && tituloListo && !ocupado;

  // Un preset virtual no tiene nada que borrar; un obligatorio no se puede quedar sin su categoría.
  const puedeEliminar = doc !== undefined && !isVirtualPreset && !doc.obligatorio;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    setErrorMsg(null);
    saveMutation.mutate({
      titulo: doc?.titulo ?? tituloTrimmed,
      contenido: contenido.trim(),
    });
  }

  const placeholder =
    doc?.proposito && contenido.length === 0 ? doc.proposito : PLACEHOLDER_GENERICO;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {tituloEditable && (
        <div>
          <Label htmlFor="kb-titulo">Título</Label>
          <Input
            id="kb-titulo"
            className="mt-1.5"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Convenios con empresas"
            maxLength={200}
            required
            autoFocus
            aria-invalid={tituloDuplicado}
            aria-describedby={tituloDuplicado ? 'kb-titulo-error' : undefined}
          />
          {tituloDuplicado && (
            <p
              id="kb-titulo-error"
              className="mt-1.5 rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive"
            >
              Este conocimiento ya existe («{tituloTrimmed}»). Ábrelo desde su tarjeta para editarlo.
            </p>
          )}
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="kb-contenido">Contenido</Label>
          <span className={`text-xs tabular-nums ${counterColor(contenido.length)}`} aria-live="polite">
            {contenido.length.toLocaleString('es-CO')} / {CONTENIDO_MAX.toLocaleString('es-CO')}
          </span>
        </div>
        <Textarea
          id="kb-contenido"
          className="mt-1.5 resize-y"
          value={contenido}
          onChange={(e) => onContenidoChange(e.target.value)}
          placeholder={placeholder}
          rows={10}
          maxLength={CONTENIDO_MAX}
          required={!isEdit}
          autoFocus={!tituloEditable}
        />
      </div>

      {errorMsg && (
        <p className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
        <div>
          {puedeEliminar && doc && (
            <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
              <Button
                type="button"
                variant="ghost"
                disabled={ocupado}
                onClick={() => setConfirmarBorrado(true)}
                className="text-destructive hover:bg-destructive-subtle hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Eliminar
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar «{doc.titulo}»?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La IA dejará de usar este contenido y se borrarán sus fragmentos indexados. No se
                    puede deshacer.
                    {doc.isPreset && ' La categoría seguirá en la lista, vacía, por si la necesitas.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      // Sin `preventDefault` el diálogo se cerraría antes de saber si el borrado
                      // funcionó, y el error aparecería sobre una confirmación ya desmontada.
                      e.preventDefault();
                      deleteMutation.mutate(doc.id);
                    }}
                    className={cn(
                      buttonVariants({ variant: 'destructive' }),
                      'transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]',
                    )}
                  >
                    {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!puedeGuardar} className="min-w-40">
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              'Guardar e indexar'
            )}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

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
import { estructuraConHorarioInvertido } from '../lib/kb-horario.js';
import { esPresetProtegido, isTitleTaken, isVirtualPresetId } from '../lib/kb-presets.js';
import { camposFaltantes, type KbEditorMode, type KbSchemaDef } from '../lib/kb-schemas.js';
import type { IKbDocument, KbEstructura } from '../types/index.js';
import { FieldCounter } from './fields/KnowledgeField.js';
import { KnowledgeStructuredForm } from './KnowledgeStructuredForm.js';

/**
 * HU-KB-07: 3.000 → 10.000. El contenido dejó de ser un texto libre para pasar a ser la suma de los
 * campos de un formulario. Debe seguir en lockstep con `CONTENIDO_MAX` de `kb.validation.ts`.
 */
const CONTENIDO_MAX = 10_000;
const PLACEHOLDER_GENERICO = 'Escribe o pega aquí la información pertinente…';

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
  /** Con qué formulario abre. Lo resuelve `modoEditor` en el diálogo (ver `kb-schemas.ts`). */
  modo: KbEditorMode;
  /** Solo en modo estructurado: el schema que gobierna el formulario. */
  schema?: KbSchemaDef;
  /**
   * Texto que se guardará. En modo legado es lo que el admin teclea; en modo estructurado es el
   * **derivado** de la estructura, y por eso aquí llega ya calculado y no se edita a mano.
   */
  contenido: string;
  onContenidoChange: (value: string) => void;
  /** Solo en modo estructurado. */
  estructura?: KbEstructura;
  onEstructuraChange?: (estructura: KbEstructura) => void;
  /** Cierra el modal: guardado con éxito, borrado con éxito o cancelación. */
  onDone: () => void;
}

/**
 * Cuerpo del modal de conocimiento: campos, guardado e (cuando procede) borrado.
 *
 * Dos formularios detrás de un mismo pie de página. La rama **legada** es la de siempre —un
 * textarea— y se conserva intacta salvo por el tope nuevo; la **estructurada** delega en
 * `KnowledgeStructuredForm`. Comparten mutación, toasts, borrado y botones a propósito: lo que
 * cambia es cómo se captura el conocimiento, no qué significa guardarlo.
 */
export function KnowledgeUploadEditor({
  doc,
  documents,
  modo,
  schema,
  contenido,
  onContenidoChange,
  estructura,
  onEstructuraChange,
  onDone,
}: KnowledgeUploadEditorProps): React.ReactElement {
  const queryClient = useQueryClient();

  // Un preset virtual todavía no existe en la base: llenarlo por primera vez es crear, no editar.
  const isVirtualPreset = doc !== undefined && isVirtualPresetId(doc.id);
  const isEdit = doc !== undefined && !isVirtualPreset;
  const tituloEditable = doc === undefined;
  const estructurado = modo === 'estructurado' && estructura !== undefined && schema !== undefined;

  const [titulo, setTitulo] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  // Los errores rojos por campo esperan a que el admin empiece a llenar: señalarle lo que le falta
  // antes de que haya hecho nada es regañarlo por abrir el modal.
  const [tocado, setTocado] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (vars: { titulo: string; contenido: string }): Promise<IKbDocument> => {
      const payload = {
        contenido: vars.contenido,
        ...(estructurado ? { estructura } : {}),
      };
      return isEdit && doc
        ? updateKbDocument(doc.id, payload)
        : createKbDocument({ titulo: vars.titulo, ...payload });
    },
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

  const faltantes = estructurado ? camposFaltantes(schema, estructura) : [];

  // Al crear, el backend exige contenido; al editar, vaciar un documento es válido (queda pendiente).
  const contenidoListo = isEdit || contenido.trim().length > 0;
  const tituloListo = !tituloEditable || (tituloTrimmed.length > 0 && !tituloDuplicado);
  const dentroDelTope = contenido.length <= CONTENIDO_MAX;

  // Un tramo que cierra antes de abrir NO se serializa, así que dejar guardar sería tirar en
  // silencio algo que el admin acaba de escribir y da por guardado. Un tramo a medio llenar es otra
  // cosa —el estado natural mientras se teclea— y no bloquea nada (HU-KB-12).
  const horarioInvertido = estructurado && estructuraConHorarioInvertido(estructura);

  const puedeGuardar =
    contenidoListo &&
    tituloListo &&
    dentroDelTope &&
    faltantes.length === 0 &&
    !horarioInvertido &&
    !ocupado;

  // Un preset virtual no tiene nada que borrar; un obligatorio no se puede quedar sin su categoría;
  // y dos presets opcionales están protegidos porque borrarlos no tiene vuelta atrás (HU-KB-12).
  const puedeEliminar =
    doc !== undefined && !isVirtualPreset && !doc.obligatorio && !esPresetProtegido(doc.titulo);

  function handleEstructuraChange(siguiente: KbEstructura): void {
    setTocado(true);
    onEstructuraChange?.(siguiente);
  }

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

      {estructurado ? (
        <>
          <KnowledgeStructuredForm
            schema={schema}
            estructura={estructura}
            onEstructuraChange={handleEstructuraChange}
            mostrarErrores={tocado}
          />

          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Texto que leerá la IA</span>
            <FieldCounter length={contenido.length} max={CONTENIDO_MAX} />
          </div>

          {tocado && faltantes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Falta completar{' '}
              {faltantes.length === 1
                ? `«${faltantes[0]?.etiqueta}»`
                : `${faltantes.length} campos obligatorios`}
              .
            </p>
          )}
        </>
      ) : (
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="kb-contenido">Contenido</Label>
            <FieldCounter length={contenido.length} max={CONTENIDO_MAX} />
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
      )}

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
                    {/*
                      Decía «La categoría seguirá en la lista, vacía, por si la necesitas» y era
                      falso: `mergePresetsWithDocuments` descarta los `oculto` y NO la repone como
                      virtual, así que la tarjeta desaparece de la grilla sin vía de retorno. Un
                      aviso de borrado que promete lo contrario de lo que hace el código es el peor
                      sitio donde tener una mentira (HU-KB-12).
                    */}
                    {doc.isPreset && ' La categoría también desaparecerá de tu base de conocimiento.'}
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

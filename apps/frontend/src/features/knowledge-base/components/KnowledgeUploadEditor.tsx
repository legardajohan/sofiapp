import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createKbDocument, updateKbDocument } from '../../../api/knowledge-base.js';
import { isVirtualPresetId } from '../lib/kb-presets.js';
import type { IKbDocument } from '../types/index.js';

const CONTENIDO_MAX = 3000;
const CONTENIDO_WARN = 2700; // 90% del tope: el contador vira a ámbar
const PLACEHOLDER_GENERICO = 'Escribe o pega aquí la información pertinente…';

/** Color del contador según cercanía al límite: neutro → ámbar (≥90%) → rojo (tope). */
function counterColor(length: number): string {
  if (length >= CONTENIDO_MAX) return 'text-destructive font-medium';
  if (length >= CONTENIDO_WARN) return 'text-amber-600';
  return 'text-muted-foreground';
}

function Spinner(): React.ReactElement {
  return (
    <svg
      className="animate-spin h-4 w-4 text-primary-foreground"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

interface KnowledgeUploadEditorProps {
  /**
   * Si viene, el editor precarga su título/contenido. Un documento real → modo edición (PATCH). Un
   * preset **virtual** (id `__preset_*`, sin documento en la DB) → modo creación (POST) con el título
   * fijado y el propósito como placeholder. Sin documento → creación libre.
   */
  document?: IKbDocument;
  /** Se llama al guardar una edición con éxito o al cancelarla, para volver a modo creación. */
  onDone?: () => void;
}

export function KnowledgeUploadEditor({
  document,
  onDone,
}: KnowledgeUploadEditorProps): React.ReactElement {
  const queryClient = useQueryClient();
  // Un preset virtual (aún sin documento real) se llena por primera vez → creación, no edición.
  const isVirtualPreset = document !== undefined && isVirtualPresetId(document.id);
  const isEdit = document !== undefined && !isVirtualPreset;

  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mutation = useMutation({
    mutationFn: (vars: { titulo: string; contenido: string }) =>
      isEdit && document
        ? updateKbDocument(document.id, { contenido: vars.contenido })
        : createKbDocument({ titulo: vars.titulo, contenido: vars.contenido }),
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'documents'] });
      if (isEdit) {
        // Al terminar una edición volvemos a modo creación; el feedback va por toast porque el
        // formulario deja de mostrar este documento.
        toast.success(
          doc.contenido.trim().length === 0
            ? `"${doc.titulo}" guardado. Queda pendiente hasta que agregues contenido.`
            : `"${doc.titulo}" actualizado. Reindexando su contenido…`,
        );
        onDone?.();
      } else if (isVirtualPreset) {
        // Llenar por primera vez un preset lo crea (POST); luego volvemos a modo creación.
        toast.success(`"${doc.titulo}" recibido. Indexando su contenido…`);
        onDone?.();
      } else {
        setSuccessMsg(`"${doc.titulo}" recibido. Indexando su contenido…`);
        setErrorMsg(null);
        setTitulo('');
        setContenido('');
      }
    },
    onError: (err: Error) => {
      const serverMsg = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setErrorMsg(serverMsg ?? 'No se pudo guardar el contenido. Intenta de nuevo.');
      setSuccessMsg(null);
    },
  });

  // Al cambiar de documento (o volver a creación) se resetea todo: contenido, mensajes y el estado
  // de la mutación. Así no se filtra nada de una operación a la siguiente. En edición, foco al texto.
  useEffect(() => {
    setTitulo(document?.titulo ?? '');
    setContenido(document?.contenido ?? '');
    setSuccessMsg(null);
    setErrorMsg(null);
    mutation.reset();
    if (document) textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    mutation.mutate({ titulo: titulo.trim(), contenido: contenido.trim() });
  }

  // En creación exigimos título y contenido; en edición el contenido puede quedar vacío (vaciar un
  // documento es válido: queda pendiente sin reindexar) y el título no se edita.
  const disabled =
    mutation.isPending || (!isEdit && (titulo.trim().length === 0 || contenido.trim().length === 0));

  const placeholder =
    (isEdit || isVirtualPreset) && document?.proposito && contenido.length === 0
      ? document.proposito
      : PLACEHOLDER_GENERICO;

  // El título va bloqueado tanto al editar como al llenar un preset (su título ya está definido).
  const tituloLocked = isEdit || isVirtualPreset;

  return (
    <div
      className={`bg-card border rounded-xl shadow-card transition-shadow ${
        isEdit ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      <div className="px-6 py-5 border-b border-border">
        {isEdit ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Editando</p>
            <h2 className="text-base font-semibold text-foreground mt-0.5">{document?.titulo}</h2>
            <p className="text-sm text-secondary-foreground mt-0.5">
              Corrige el contenido y guarda. La IA se reindexará con el nuevo texto.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-foreground">Cargar conocimiento</h2>
            <p className="text-sm text-secondary-foreground mt-0.5">
              Pega o escribe el texto con el que la IA responderá a tus prospectos.
            </p>
          </>
        )}
      </div>
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground" htmlFor="kb-titulo">
            Título
          </label>
          <input
            id="kb-titulo"
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Preguntas frecuentes sobre precios"
            maxLength={200}
            required={!tituloLocked}
            disabled={tituloLocked}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? 'El título no se puede cambiar al editar; solo su contenido.'
              : isVirtualPreset
                ? 'Conocimiento predefinido: su título ya está fijado; solo agrega el contenido.'
                : 'Reutilizar un título existente crea una nueva versión del documento.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground" htmlFor="kb-contenido">
            Contenido
          </label>
          <textarea
            id="kb-contenido"
            ref={textareaRef}
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder={placeholder}
            rows={10}
            maxLength={CONTENIDO_MAX}
            required={!isEdit}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors resize-y"
          />
          <p className={`text-xs text-right ${counterColor(contenido.length)}`} aria-live="polite">
            {contenido.length.toLocaleString()} / {CONTENIDO_MAX.toLocaleString()} caracteres
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {mutation.isPending ? (
              <>
                <Spinner />
                {isEdit ? 'Guardando…' : 'Cargando…'}
              </>
            ) : isEdit ? (
              'Guardar cambios'
            ) : (
              'Cargar e indexar'
            )}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={() => onDone?.()}
              disabled={mutation.isPending}
              className="px-4 py-2.5 border border-input text-sm font-medium text-foreground rounded-lg hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              Cancelar
            </button>
          )}
        </div>

        {successMsg && (
          <div className="flex items-center gap-3 p-4 bg-success-subtle border border-success/30 rounded-xl text-sm text-success">
            <svg className="w-5 h-5 flex-shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-3 p-4 bg-destructive-subtle border border-destructive/30 rounded-xl text-sm text-destructive">
            <svg className="w-5 h-5 flex-shrink-0 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {errorMsg}
          </div>
        )}
      </form>
    </div>
  );
}

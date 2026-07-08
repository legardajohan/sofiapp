import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createKbDocument } from '../../../api/knowledge-base.js';

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

export function KnowledgeUploadEditor(): React.ReactElement {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createKbDocument,
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'documents'] });
      setSuccessMsg(`"${doc.titulo}" recibido. Indexando su contenido…`);
      setErrorMsg(null);
      setTitulo('');
      setContenido('');
    },
    onError: (err: Error) => {
      setErrorMsg(err.message ?? 'No se pudo cargar el conocimiento.');
      setSuccessMsg(null);
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    mutation.mutate({ titulo: titulo.trim(), contenido: contenido.trim() });
  }

  const disabled = mutation.isPending || titulo.trim().length === 0 || contenido.trim().length === 0;

  return (
    <div className="bg-card border border-border rounded-xl shadow-card">
      <div className="px-6 py-5 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">Cargar conocimiento</h2>
        <p className="text-sm text-secondary-foreground mt-0.5">
          Pega o escribe el texto con el que la IA responderá a tus prospectos.
        </p>
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
            required
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors"
          />
          <p className="text-xs text-muted-foreground">
            Reutilizar un título existente crea una nueva versión del documento.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground" htmlFor="kb-contenido">
            Contenido
          </label>
          <textarea
            id="kb-contenido"
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder="Escribe o pega aquí la información pertinente…"
            rows={10}
            maxLength={100_000}
            required
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors resize-y"
          />
          <p className="text-xs text-muted-foreground text-right">
            {contenido.length.toLocaleString()} / 100 000 caracteres
          </p>
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
        >
          {mutation.isPending ? (
            <>
              <Spinner />
              Cargando…
            </>
          ) : (
            'Cargar e indexar'
          )}
        </button>

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

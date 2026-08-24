import { Eye } from 'lucide-react';

interface SystemPromptPreviewProps {
  tono: string;
  systemPrompt: string;
}

/**
 * Muestra el system prompt **tal y como lo arma el backend** antes de mandárselo a Gemini:
 * `Tono: {tono}. {instrucciones}` seguido del bloque de CONTEXTO que rellena la base de
 * conocimiento en cada consulta.
 *
 * No es decoración: es lo que hace evidente por qué tono e instrucciones son dos campos y no uno,
 * y de dónde sale la información con la que Sofi responde. Sin esto, escribir un buen prompt es
 * adivinar.
 */
export function SystemPromptPreview({
  tono,
  systemPrompt,
}: SystemPromptPreviewProps): React.ReactElement {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Eye className="size-4 text-secondary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Así lo recibe el modelo</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sofi lee esto antes de cada respuesta. El contexto cambia en cada consulta: lo arma tu
            base de conocimiento.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
          <span className="text-muted-foreground">Tono: </span>
          <span className="text-primary">{tono || 'sin definir'}</span>
          <span className="text-muted-foreground">. </span>
          {systemPrompt || 'Sin instrucciones.'}
          {'\n\n'}
          <span className="text-muted-foreground">
            --- CONTEXTO ---{'\n'}
            (los fragmentos de tu base de conocimiento que respondan a la pregunta){'\n'}
            --- FIN CONTEXTO ---
          </span>
        </pre>
      </div>
    </section>
  );
}

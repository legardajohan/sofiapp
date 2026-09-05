import { useEffect, useState } from 'react';
import { Loader2, MessageSquareText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSaveAssistantConfig } from '../hooks/useAssistantConfig.js';
import { SYSTEM_PROMPT_MAX, TONO_MAX, type AssistantConfig } from '../types.js';

interface AssistantConfigFormProps {
  config: AssistantConfig;
}

export function AssistantConfigForm({ config }: AssistantConfigFormProps): React.ReactElement {
  const [tono, setTono] = useState(config.tono);
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const guardar = useSaveAssistantConfig();

  // Tras guardar, el servidor devuelve la versión canónica (y `heredado: false`): el formulario
  // se resincroniza con ella para que "descartar" vuelva a lo guardado, no a lo heredado.
  useEffect(() => {
    setTono(config.tono);
    setSystemPrompt(config.systemPrompt);
  }, [config]);

  const hayCambios = tono !== config.tono || systemPrompt !== config.systemPrompt;
  const esValido = tono.trim().length > 0 && systemPrompt.trim().length > 0;
  const puedeGuardar = hayCambios && esValido && !guardar.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    guardar.mutate({ tono: tono.trim(), systemPrompt: systemPrompt.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <MessageSquareText className="size-4 text-secondary-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Cómo habla Sofi</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              El tono define cómo suena. Las instrucciones definen qué puede y qué no puede decir.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="asistente-tono">Tono</Label>
            <Input
              id="asistente-tono"
              value={tono}
              onChange={(e) => setTono(e.target.value)}
              maxLength={TONO_MAX}
              placeholder="profesional, claro y cercano"
              aria-describedby="asistente-tono-ayuda"
            />
            <p id="asistente-tono-ayuda" className="text-xs text-muted-foreground">
              Unas pocas palabras. Se envía en su propio campo, así que no hace falta repetirlo en
              las instrucciones.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="asistente-prompt">Instrucciones</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {systemPrompt.length.toLocaleString('es-CO')} / {SYSTEM_PROMPT_MAX.toLocaleString('es-CO')}
              </span>
            </div>
            <Textarea
              id="asistente-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              maxLength={SYSTEM_PROMPT_MAX}
              rows={14}
              className="font-mono text-xs leading-relaxed"
              aria-describedby="asistente-prompt-ayuda"
            />
            <p id="asistente-prompt-ayuda" className="text-xs text-muted-foreground">
              Mantén la regla de responder solo con el contexto: es lo que evita que Sofi invente
              precios, horarios o condiciones.
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          disabled={!hayCambios || guardar.isPending}
          onClick={() => {
            setTono(config.tono);
            setSystemPrompt(config.systemPrompt);
          }}
        >
          Descartar cambios
        </Button>
        <Button type="submit" disabled={!puedeGuardar} className="sm:w-40">
          {guardar.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Guardando
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden="true" />
              Guardar cambios
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

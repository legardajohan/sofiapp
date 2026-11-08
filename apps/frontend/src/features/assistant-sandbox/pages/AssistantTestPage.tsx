import { FlaskConical } from 'lucide-react';
import { SandboxChat } from '../components/SandboxChat.js';

export function AssistantTestPage(): React.ReactElement {
  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] min-h-[28rem] max-w-3xl flex-col gap-4">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
          <FlaskConical className="size-5 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Probar asistente</h1>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Conversa con Sofi como lo haría un cliente. Usa tu flujo, tu base de conocimiento y tus
            preguntas frecuentes tal como están hoy, para que valides cómo responde antes de que lo
            vea alguien más.
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <SandboxChat />
      </div>
    </div>
  );
}

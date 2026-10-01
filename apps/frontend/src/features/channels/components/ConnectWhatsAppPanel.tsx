import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UseEmbeddedSignup } from '../hooks/useEmbeddedSignup.js';
import { PRESS } from '../lib/press.js';
import { PinForm } from './PinForm.js';
import { SignupSteps } from './SignupSteps.js';

function FacebookGlyph(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
    </svg>
  );
}

/**
 * Invitación a conectar y, en la misma superficie, el progreso de la conexión. `reconectando`
 * cambia solo el titular: el flujo es idéntico para cambiar de número.
 */
export function ConnectWhatsAppPanel({
  signup,
  reconectando,
  onVolver,
}: {
  signup: UseEmbeddedSignup;
  reconectando: boolean;
  /** Solo al cambiar de número: vuelve al canal actual sin tocar nada. */
  onVolver: () => void;
}): React.ReactElement {
  const { disponible, listo, fase, iniciar, activar, activando, error } = signup;
  const ocupado = fase === 'autorizando' || fase === 'activando';

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="max-w-prose">
        <h2 className="text-base font-semibold text-foreground text-balance">
          {reconectando ? 'Conecta otro número' : 'Conecta tu WhatsApp Business'}
        </h2>
        <p className="mt-1 text-sm text-secondary-foreground">
          {reconectando
            ? 'El número actual deja de recibir mensajes en SofiApp cuando termines de conectar el nuevo.'
            : 'Tus clientes te siguen escribiendo al mismo número; las conversaciones llegan a tu bandeja de SofiApp.'}
        </p>
      </div>

      <div className="mt-6">
        <SignupSteps fase={fase}>
          {fase === 'pin' && <PinForm onSubmit={activar} enviando={activando} error={error} />}
        </SignupSteps>
      </div>

      {fase !== 'pin' && (
        <div className="mt-7 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:gap-4">
          <Button
            size="lg"
            onClick={iniciar}
            disabled={!disponible || !listo || ocupado}
            className={`${PRESS} px-5`}
          >
            {ocupado || (disponible && !listo) ? (
              <Loader2 className="motion-safe:animate-spin" />
            ) : (
              <FacebookGlyph />
            )}
            {fase === 'activando' ? 'Activando tu número…' : 'Conectar con Facebook'}
          </Button>
          {reconectando && !ocupado && (
            <Button variant="ghost" size="lg" onClick={onVolver} className={PRESS}>
              Volver
            </Button>
          )}
          <p className="text-sm text-secondary-foreground sm:ml-auto sm:max-w-64">
            {disponible
              ? 'Se abre una ventana de Meta. SofiApp nunca ve tu contraseña de Facebook.'
              : 'La conexión con Facebook no está configurada en este entorno. Usa la conexión manual de abajo.'}
          </p>
        </div>
      )}
    </section>
  );
}

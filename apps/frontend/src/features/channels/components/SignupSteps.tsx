import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SignupPhase } from '../hooks/useEmbeddedSignup.js';

type StepState = 'pendiente' | 'actual' | 'hecho';

interface Step {
  titulo: string;
  detalle: string;
  /** Qué se muestra mientras este paso está en curso. */
  enCurso: string;
}

const STEPS: readonly Step[] = [
  {
    titulo: 'Inicia sesión con Facebook',
    detalle: 'Con la cuenta que administra el negocio de tu empresa en Meta.',
    enCurso: 'Completa los pasos en la ventana de Meta.',
  },
  {
    titulo: 'Elige tu cuenta y tu número',
    detalle: 'Meta te muestra las cuentas de WhatsApp Business a las que tienes acceso.',
    enCurso: 'Selecciona la cuenta y el número que atenderá SofiApp.',
  },
  {
    titulo: 'Activamos tu número',
    detalle: 'SofiApp se encarga del resto. En segundos empiezas a recibir mensajes.',
    enCurso: 'Configurando la conexión con Meta…',
  },
];

function stateFor(index: number, fase: SignupPhase): StepState {
  if (fase === 'idle') return 'pendiente';
  // Los pasos 1 y 2 ocurren dentro del mismo popup de Meta: no sabemos en cuál está la persona.
  if (fase === 'autorizando') return index < 2 ? 'actual' : 'pendiente';
  return index < 2 ? 'hecho' : 'actual';
}

function StepMarker({ index, state }: { index: number; state: StepState }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-200',
        state === 'pendiente' && 'border-border bg-card text-secondary-foreground',
        state === 'actual' && 'border-primary bg-primary text-primary-foreground',
        state === 'hecho' && 'border-success bg-success text-success-foreground',
      )}
    >
      {state === 'hecho' ? (
        <Check className="size-3.5" strokeWidth={3} />
      ) : state === 'actual' ? (
        <Loader2 className="size-3.5 motion-safe:animate-spin" />
      ) : (
        index + 1
      )}
    </span>
  );
}

/**
 * Los tres pasos del Embedded Signup. En reposo explican qué va a pasar; durante la conexión la
 * misma lista se vuelve el indicador de progreso, así la persona ve avanzar lo que ya leyó en vez de
 * un spinner sin contexto.
 */
export function SignupSteps({
  fase,
  children,
}: {
  fase: SignupPhase;
  /** Contenido extra bajo el último paso (el formulario del PIN). */
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <ol className="relative space-y-5" aria-live="polite">
      {/* Guía vertical que une los marcadores. */}
      <span aria-hidden="true" className="absolute bottom-3.5 left-3.5 top-3.5 w-px -translate-x-1/2 bg-border" />
      {STEPS.map((step, index) => {
        const state = stateFor(index, fase === 'pin' ? 'activando' : fase);
        const esUltimo = index === STEPS.length - 1;
        return (
          <li key={step.titulo} className="relative flex gap-3.5">
            <StepMarker index={index} state={state} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  'text-sm font-medium transition-colors duration-200',
                  state === 'pendiente' && fase !== 'idle' ? 'text-secondary-foreground' : 'text-foreground',
                )}
              >
                {step.titulo}
                {state === 'hecho' && <span className="sr-only"> (completado)</span>}
              </p>
              <p className="mt-0.5 text-sm text-secondary-foreground">
                {state === 'actual' && !(esUltimo && fase === 'pin') ? step.enCurso : step.detalle}
              </p>
              {esUltimo && children}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

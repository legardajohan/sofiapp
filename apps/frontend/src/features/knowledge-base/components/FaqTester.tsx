import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { faqErrorMessage, testKbFaq } from '../../../api/kb-faqs.js';
import type { FaqTestResult } from '../types/index.js';

const pct = (v: number): number => Math.round(v * 100);

/**
 * Medidor de similitud con la marca del umbral. Es el instrumento de calibración:
 * hace visible un número abstracto (0–1) y dónde está el corte.
 *
 * El relleno se anima con `scaleX` (propiedad de composición) en vez de `width`,
 * para no disparar layout en cada frame.
 */
function ConfidenceMeter({ confianza, umbral, matched }: {
  confianza: number;
  umbral: number;
  matched: boolean;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={pct(confianza)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Similitud con la FAQ más parecida"
      >
        <div
          className={`h-full w-full origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none ${
            matched ? 'bg-success' : 'bg-primary'
          }`}
          style={{ transform: `scaleX(${Math.min(Math.max(confianza, 0), 1)})` }}
        />
        {/* Marca del umbral: el corte a partir del cual se responde sin modelo. */}
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${pct(umbral)}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="relative h-4">
        <span
          className="absolute -translate-x-1/2 text-xs tabular-nums text-muted-foreground"
          style={{ left: `${pct(umbral)}%` }}
        >
          umbral {pct(umbral)}%
        </span>
      </div>
    </div>
  );
}

export function FaqTester(): React.ReactElement {
  const [pregunta, setPregunta] = useState('');
  const [resultado, setResultado] = useState<FaqTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: testKbFaq,
    onSuccess: (data) => {
      setResultado(data);
      setError(null);
    },
    onError: (err: Error) => {
      setResultado(null);
      setError(
        faqErrorMessage(
          err,
          'No se pudo probar la pregunta. Revisa que el índice de búsqueda esté creado.',
        ),
      );
    },
  });

  const puedeProbe = pregunta.trim().length >= 3 && !mutation.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeProbe) return;
    mutation.mutate(pregunta.trim());
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FlaskConical className="size-4 text-secondary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Probar una pregunta</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Escríbela como la haría un prospecto y mira si alguna FAQ la responde sin gastar tokens.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="faq-test" className="sr-only">
          Pregunta de prueba
        </Label>
        <Input
          id="faq-test"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="¿Cuánto cuesta el curso?"
          maxLength={300}
          className="flex-1"
        />
        <Button type="submit" disabled={!puedeProbe} className="sm:w-28">
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            'Probar'
          )}
          <span className="sr-only">{mutation.isPending ? 'Probando…' : ''}</span>
        </Button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {resultado && !error && (
        <div className="mt-5 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium text-foreground">
              {resultado.confianza === undefined
                ? 'Ninguna FAQ se parece a esta pregunta.'
                : resultado.matched
                  ? 'Responde la FAQ, sin gastar tokens.'
                  : 'Esta pregunta iría al modelo.'}
            </p>
            {resultado.confianza !== undefined && (
              <span
                className={`shrink-0 text-2xl font-semibold tabular-nums ${
                  resultado.matched ? 'text-success' : 'text-foreground'
                }`}
              >
                {pct(resultado.confianza)}%
              </span>
            )}
          </div>

          {resultado.confianza !== undefined && (
            <div className="mt-3">
              <ConfidenceMeter
                confianza={resultado.confianza}
                umbral={resultado.umbral}
                matched={resultado.matched}
              />
            </div>
          )}

          {resultado.pregunta && (
            <div className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">FAQ más parecida</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{resultado.pregunta}</p>
              {resultado.respuesta && (
                <p className="mt-1 text-sm text-secondary-foreground">{resultado.respuesta}</p>
              )}
            </div>
          )}

          {resultado.confianza === undefined && (
            <p className="mt-2 text-sm text-muted-foreground">
              Crea una FAQ con esta pregunta para que Sofi la responda sin consultar al modelo.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

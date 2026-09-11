import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, FlaskConical, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { faqErrorMessage, testKbFaq } from '../../../api/kb-faqs.js';
import type { FaqTestResult } from '../types/index.js';

const pct = (v: number): number => Math.round(v * 100);

/** El margen vive en un rango diez veces menor que las otras dos señales: 0% no lo describe. */
const pctFino = (v: number): string => `${(v * 100).toFixed(1)}%`;

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

/**
 * Una de las tres condiciones que deben cumplirse a la vez. No están numeradas a propósito:
 * no son pasos de un proceso, son requisitos simultáneos.
 *
 * El peso visual va entero a la que bloqueó — es la única que responde la pregunta que trae
 * el admin a esta pantalla. Las que pasan se leen de un vistazo y se quitan de en medio.
 */
function Senal({ etiqueta, valor, minimo, paso, detalle }: {
  etiqueta: string;
  valor: string;
  minimo: string;
  paso: boolean;
  detalle?: string;
}): React.ReactElement {
  return (
    <li className={`px-3 py-2.5 ${paso ? '' : 'bg-destructive-subtle'}`}>
      <div className="flex items-center gap-2.5">
        {paso ? (
          <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <X className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <span
          className={`min-w-0 flex-1 text-sm ${paso ? 'text-secondary-foreground' : 'font-medium text-foreground'}`}
        >
          {etiqueta}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-foreground">{valor}</span>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          mín. {minimo}
        </span>
        <span className="sr-only">{paso ? 'Cumple' : 'No cumple'}</span>
      </div>
      {detalle && <p className="mt-1 pl-6 text-xs text-muted-foreground">{detalle}</p>}
    </li>
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

          {resultado.senales && (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
              <Senal
                etiqueta="Se parece a la FAQ"
                valor={`${pct(resultado.senales.score)}%`}
                minimo={`${pct(resultado.umbral)}%`}
                paso={resultado.senales.pasaUmbral}
              />
              <Senal
                etiqueta="Le saca ventaja a la siguiente FAQ"
                valor={
                  resultado.senales.segundoScore === undefined
                    ? '—'
                    : pctFino(resultado.senales.margen)
                }
                minimo={pctFino(resultado.margenMinimo)}
                paso={resultado.senales.pasaMargen}
                detalle={
                  resultado.segundaPregunta
                    ? `Compite con «${resultado.segundaPregunta}»`
                    : 'No hay otra FAQ con la que competir.'
                }
              />
              <Senal
                etiqueta="Comparten palabras"
                valor={`${pct(resultado.senales.overlap)}%`}
                minimo={`${pct(resultado.overlapMinimo)}%`}
                paso={resultado.senales.pasaOverlap}
                detalle={
                  resultado.senales.pasaOverlap
                    ? undefined
                    : 'Dos preguntas pueden parecerse por tema y pedir cosas distintas. Sin palabras en común, Sofi prefiere no arriesgarse.'
                }
              />
            </ul>
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

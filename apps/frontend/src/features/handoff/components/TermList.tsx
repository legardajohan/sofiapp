import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TERMINO_MIN, TERMINOS_MAX } from '../types.js';

interface TermListProps {
  id: string;
  label: string;
  ayuda: string;
  placeholder: string;
  terminos: string[];
  onChange: (terminos: string[]) => void;
}

/**
 * Lista editable de palabras o frases. Se escribe una y se añade con Enter o con el botón.
 *
 * Es un editor de chips y no un `textarea` de líneas sueltas a propósito: cada término tiene que
 * verse como una unidad que se puede quitar de un clic, porque el admin va a repasar esta lista
 * más veces de las que la va a escribir.
 */
export function TermList({
  id,
  label,
  ayuda,
  placeholder,
  terminos,
  onChange,
}: TermListProps): React.ReactElement {
  const [borrador, setBorrador] = useState('');

  const limpio = borrador.trim();
  // Duplicados fuera: dos veces la misma palabra no dispara "más", solo alarga la lista.
  const yaEsta = terminos.some((t) => t.toLowerCase() === limpio.toLowerCase());
  const puedeAgregar = limpio.length >= TERMINO_MIN && !yaEsta && terminos.length < TERMINOS_MAX;

  function agregar(): void {
    if (!puedeAgregar) return;
    onChange([...terminos, limpio]);
    setBorrador('');
  }

  function quitar(termino: string): void {
    onChange(terminos.filter((t) => t !== termino));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {terminos.length} / {TERMINOS_MAX}
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          id={id}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            // Enter añade el término; sin esto, dentro de un <form>, enviaría el formulario entero.
            if (e.key === 'Enter') {
              e.preventDefault();
              agregar();
            }
          }}
          placeholder={placeholder}
          aria-describedby={`${id}-ayuda`}
        />
        <button
          type="button"
          onClick={agregar}
          disabled={!puedeAgregar}
          aria-label={`Añadir "${limpio}"`}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-secondary-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>

      <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
        {ayuda}
      </p>

      {terminos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pt-1">
          {terminos.map((t) => (
            <li key={t}>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 py-1 pl-2.5 pr-1 text-xs text-foreground">
                {t}
                <button
                  type="button"
                  onClick={() => quitar(t)}
                  aria-label={`Quitar "${t}"`}
                  className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

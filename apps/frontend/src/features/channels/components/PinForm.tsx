import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PRESS } from '../lib/press.js';

/**
 * Solo aparece cuando Meta responde que el número ya tenía verificación en dos pasos con un PIN
 * propio. Va en línea bajo el paso 3 y no en un modal: es la continuación del mismo paso.
 */
export function PinForm({
  onSubmit,
  enviando,
  error,
}: {
  onSubmit: (pin?: string) => void;
  enviando: boolean;
  error: string | null;
}): React.ReactElement {
  const [pin, setPin] = useState('');
  const valido = /^\d{6}$/.test(pin);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (valido) onSubmit(pin);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
    >
      <div className="space-y-1.5">
        <Label htmlFor="whatsapp-pin">PIN de verificación en dos pasos</Label>
        <p id="whatsapp-pin-ayuda" className="text-sm text-secondary-foreground">
          Este número ya tenía un PIN de 6 dígitos. Lo definió quien administra el número, en
          WhatsApp Manager o en la app de WhatsApp Business.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="whatsapp-pin"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
          autoFocus
          aria-describedby={error ? 'whatsapp-pin-ayuda whatsapp-pin-error' : 'whatsapp-pin-ayuda'}
          aria-invalid={error ? true : undefined}
          className="font-mono tracking-[0.4em] sm:max-w-40"
        />
        <Button type="submit" disabled={!valido || enviando} className={PRESS}>
          {enviando && <Loader2 className="motion-safe:animate-spin" />}
          {enviando ? 'Activando…' : 'Activar número'}
        </Button>
      </div>
      {error && (
        <p id="whatsapp-pin-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-sm text-secondary-foreground">
        ¿No tienes el PIN? Quien administra el número puede desactivar la verificación en dos pasos
        en WhatsApp Manager.{' '}
        <button
          type="button"
          onClick={() => onSubmit()}
          disabled={enviando}
          className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          Ya la desactivé, activar
        </button>
      </p>
    </form>
  );
}

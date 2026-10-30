import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  disabled: boolean;
  /** Por qué no se puede escribir; sustituye al placeholder. */
  motivoBloqueo?: string;
  pending: boolean;
  onSend: (texto: string) => void | Promise<unknown>;
}

/**
 * Campo de texto del chat de prueba. Solo texto: la prueba no envía archivos ni audio. Misma mecánica
 * que el composer de la bandeja —Enter envía, Mayús+Enter salta de línea, y el texto vuelve al campo
 * si el envío falla— sin los adjuntos que aquí no existen.
 */
export function SandboxComposer({ disabled, motivoBloqueo, pending, onSend }: Props): React.ReactElement {
  const [texto, setTexto] = useState('');
  const bloqueado = disabled || pending;
  const hayTexto = texto.trim().length > 0;

  function submit(): void {
    if (bloqueado) return;
    const value = texto.trim();
    if (!value) return;
    // Se vacía al instante, como en WhatsApp; si falla, se devuelve salvo que ya haya escrito otra cosa.
    setTexto('');
    void Promise.resolve(onSend(value)).catch(() => {
      setTexto((actual) => (actual.trim() ? actual : value));
    });
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // `isComposing`: el panel de emojis del sistema y los IME confirman con Enter.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={disabled ? (motivoBloqueo ?? 'No disponible') : 'Escribe como lo haría un cliente…'}
        aria-label="Mensaje de prueba"
        disabled={disabled}
        rows={1}
        maxLength={4096}
        className="max-h-40 min-h-[40px] resize-none"
      />
      <Button
        type="button"
        size="icon"
        onClick={submit}
        disabled={bloqueado || !hayTexto}
        aria-label="Enviar mensaje de prueba"
        className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
      >
        <Send aria-hidden="true" />
      </Button>
    </div>
  );
}

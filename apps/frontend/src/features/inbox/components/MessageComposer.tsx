import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  disabled: boolean;
  pending: boolean;
  onSend: (texto: string) => void;
}

export function MessageComposer({ disabled, pending, onSend }: Props): React.ReactElement {
  const [texto, setTexto] = useState('');

  function submit(): void {
    const value = texto.trim();
    if (!value || pending || disabled) return;
    onSend(value);
    setTexto('');
  }

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? 'Ventana de 24 h cerrada' : 'Escribe un mensaje…'}
          disabled={disabled || pending}
          rows={1}
          className="max-h-40 min-h-[40px] resize-none"
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={disabled || pending || !texto.trim()}
          aria-label="Enviar"
          className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

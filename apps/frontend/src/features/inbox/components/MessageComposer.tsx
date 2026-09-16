import { useRef, useState } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ACCEPT_ARCHIVOS, validarArchivo } from '../lib/media.js';
import { AttachmentPreview } from './AttachmentPreview.js';

interface Props {
  disabled: boolean;
  pending: boolean;
  onSend: (texto: string) => void;
  onSendMedia: (archivo: File, caption: string) => void;
  /** 0-100 mientras sube un archivo; `null` si no hay subida en curso. */
  uploadProgress: number | null;
}

export function MessageComposer({
  disabled,
  pending,
  onSend,
  onSendMedia,
  uploadProgress,
}: Props): React.ReactElement {
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // `dragenter`/`dragleave` se disparan también al pasar por encima de los hijos. Sin contar la
  // profundidad, el overlay parpadea cada vez que el cursor cruza el textarea.
  const profundidad = useRef(0);

  const subiendo = uploadProgress !== null;
  const bloqueado = disabled || pending || subiendo;

  function elegir(file: File): void {
    const resultado = validarArchivo(file);
    if (!resultado.ok) {
      toast.error('No se puede enviar ese archivo', { description: resultado.motivo });
      return;
    }
    setArchivo(file);
  }

  function submit(): void {
    if (bloqueado) return;

    if (archivo) {
      onSendMedia(archivo, texto.trim());
      setArchivo(null);
      setTexto('');
      return;
    }

    const value = texto.trim();
    if (!value) return;
    onSend(value);
    setTexto('');
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault();
    profundidad.current = 0;
    setArrastrando(false);
    if (bloqueado) return;

    const file = e.dataTransfer.files[0];
    if (file) elegir(file);
  }

  return (
    <div
      className="relative border-t border-border p-3"
      onDragEnter={(e) => {
        e.preventDefault();
        profundidad.current += 1;
        if (!bloqueado) setArrastrando(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        profundidad.current -= 1;
        if (profundidad.current <= 0) setArrastrando(false);
      }}
      onDrop={onDrop}
    >
      {/* Solo el composer acepta el archivo, no el hilo entero: soltar una foto encima de un
          mensaje no debe enviar nada. */}
      {arrastrando && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
          <p className="text-sm font-medium text-primary">Suelta el archivo para adjuntarlo</p>
        </div>
      )}

      {archivo && (
        <AttachmentPreview
          archivo={archivo}
          progreso={uploadProgress}
          onQuitar={() => setArchivo(null)}
        />
      )}

      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ARCHIVOS}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) elegir(file);
            // Se limpia para que elegir el mismo archivo dos veces seguidas vuelva a disparar
            // `change`.
            e.target.value = '';
          }}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => inputRef.current?.click()}
          // Con la ventana cerrada no se puede enviar nada libre: dejar adjuntar aquí sería pedirle
          // al asesor que suba 8 MB para recibir un 422.
          disabled={bloqueado}
          aria-label="Adjuntar archivo"
          className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
        >
          <Paperclip />
        </Button>

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            disabled
              ? 'Ventana de 24 h cerrada'
              : archivo
                ? 'Añade un comentario…'
                : 'Escribe un mensaje…'
          }
          disabled={bloqueado}
          rows={1}
          className={cn('max-h-40 min-h-[40px] resize-none')}
        />

        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={bloqueado || (!texto.trim() && !archivo)}
          aria-label="Enviar"
          className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

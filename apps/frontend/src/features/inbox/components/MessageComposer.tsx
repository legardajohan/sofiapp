import { useRef, useState } from 'react';
import { FileText, Images, Paperclip, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ACCEPT_DOCUMENTOS, ACCEPT_IMAGENES_VIDEOS, validarArchivo } from '../lib/media.js';
import { MediaSendDialog } from './MediaSendDialog.js';

interface Props {
  disabled: boolean;
  pending: boolean;
  onSend: (texto: string) => void;
  /**
   * Devuelve una promesa a propósito: el composer necesita saber cuándo TERMINÓ la subida para
   * cerrar la ventana de confirmación. Antes limpiaba el archivo al instante, así que la ventana se
   * cerraba —y la barra de progreso desaparecía— antes de subir un solo byte.
   */
  onSendMedia: (archivo: File, caption: string) => Promise<unknown>;
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
  // Dos inputs y no uno: cada entrada del menú abre el diálogo del sistema con su propio `accept`,
  // que es lo que hace que «Fotos y videos» y «Documento» se comporten distinto de verdad.
  const inputMediaRef = useRef<HTMLInputElement>(null);
  const inputDocRef = useRef<HTMLInputElement>(null);
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

  function onElegirArchivo(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) elegir(file);
    // Se limpia para que elegir el mismo archivo dos veces seguidas vuelva a disparar `change`.
    e.target.value = '';
  }

  /**
   * Abre el diálogo de archivos desde una entrada del menú.
   *
   * Diferido un tick a propósito: Radix devuelve el foco al disparador al cerrar el desplegable, y
   * abrir el diálogo del sistema en el mismo tick compite con esa restauración — algunos navegadores
   * descartan la apertura y al asesor no le pasa nada al pulsar.
   */
  function abrirSelector(ref: React.RefObject<HTMLInputElement | null>): void {
    setTimeout(() => ref.current?.click(), 0);
  }

  function submit(): void {
    if (bloqueado) return;

    const value = texto.trim();
    if (!value) return;
    onSend(value);
    setTexto('');
  }

  /**
   * Manda el archivo y espera a que termine.
   *
   * Si falla, el archivo **se queda**: el asesor puede reintentar sin volver a buscarlo, y el
   * motivo se lo dice el toast de la mutación.
   */
  async function enviarArchivo(caption: string): Promise<void> {
    if (!archivo) return;
    try {
      await onSendMedia(archivo, caption);
      setArchivo(null);
      // El texto del composer viajó como pie de foto: dejarlo ahí haría que el asesor lo mandara
      // otra vez como mensaje suelto.
      setTexto('');
    } catch {
      // El toast lo muestra `useSendMedia`; aquí solo se evita cerrar la ventana.
    }
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

      <MediaSendDialog
        archivo={archivo}
        progreso={uploadProgress}
        captionInicial={texto.trim()}
        onEnviar={(caption) => void enviarArchivo(caption)}
        // Cancelar NO borra lo escrito en el composer: el asesor descartó el archivo, no su texto.
        onCancelar={() => setArchivo(null)}
      />

      <div className="flex items-end gap-2">
        <input
          ref={inputMediaRef}
          type="file"
          accept={ACCEPT_IMAGENES_VIDEOS}
          hidden
          onChange={onElegirArchivo}
        />
        <input
          ref={inputDocRef}
          type="file"
          accept={ACCEPT_DOCUMENTOS}
          hidden
          onChange={onElegirArchivo}
        />

        <DropdownMenu>
          {/* `disabled` también en el disparador, no solo en el botón: con `asChild` Radix NO hereda
              el `disabled` del hijo —abre en `pointerdown` mirando su propia prop—, así que sin
              esto el menú se abría con la ventana de 24 h cerrada y el asesor podía adjuntar un
              archivo que luego no iba a poder enviar. */}
          <DropdownMenuTrigger asChild disabled={bloqueado}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              // Con la ventana cerrada no se puede enviar nada libre: dejar adjuntar aquí sería
              // pedirle al asesor que suba 8 MB para recibir un 422.
              disabled={bloqueado}
              aria-label="Adjuntar archivo"
              className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
            >
              <Paperclip />
            </Button>
          </DropdownMenuTrigger>
          {/* `side="top"`: el composer vive al pie de la pantalla, y el desplegable por defecto se
              abriría fuera de la vista. */}
          <DropdownMenuContent align="start" side="top" className="w-52">
            <DropdownMenuItem onSelect={() => abrirSelector(inputMediaRef)}>
              <Images className="h-4 w-4 text-adjunto-galeria" />
              Fotos y videos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => abrirSelector(inputDocRef)}>
              <FileText className="h-4 w-4 text-adjunto-documento" />
              Documento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
          disabled={bloqueado}
          rows={1}
          className={cn('max-h-40 min-h-[40px] resize-none')}
        />

        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={bloqueado || !texto.trim()}
          aria-label="Enviar"
          className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

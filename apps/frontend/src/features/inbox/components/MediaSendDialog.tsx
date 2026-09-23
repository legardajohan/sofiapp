import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, File as FileIcon, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { clasificarArchivo, formatearTamano } from '../lib/media.js';

interface Props {
  /** El archivo elegido. `null` cierra la ventana. */
  archivo: File | null;
  /** 0-100 mientras sube; `null` si no hay subida en curso. */
  progreso: number | null;
  /**
   * Lo que el asesor ya había escrito en el composer al adjuntar. Se arrastra como pie de foto
   * porque escribir primero y adjuntar después es un orden natural, y perderlo en silencio es la
   * diferencia entre «mandé la foto con su explicación» y «mandé una foto suelta».
   */
  captionInicial: string;
  onEnviar: (caption: string) => void;
  onCancelar: () => void;
}

/**
 * Confirmación antes de mandar un archivo, como en WhatsApp: el archivo grande arriba y el
 * comentario abajo, junto al botón de enviar.
 *
 * Es una ventana y no una tira sobre el composer porque mandar el documento equivocado a un cliente
 * no se puede deshacer: a ese tamaño el asesor ve *qué* está mandando, no solo el nombre del
 * fichero. El comentario vive aquí y se descarta al cancelar — es del envío, no del hilo.
 */
export function MediaSendDialog({
  archivo,
  progreso,
  captionInicial,
  onEnviar,
  onCancelar,
}: Props): React.ReactElement {
  const [caption, setCaption] = useState('');
  const subiendo = progreso !== null;

  // Al cambiar de archivo se parte de lo que hubiera en el composer. La dependencia es SOLO
  // `archivo`: si `captionInicial` estuviera aquí, cada tecla que el asesor escribe en la ventana
  // —que no toca el composer— no la pisaría, pero sí lo haría cualquier re-render que cambiara esa
  // prop, y el comentario se reiniciaría a mitad de escribirlo.
  useEffect(() => {
    setCaption(archivo ? captionInicial : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo]);

  function enviar(): void {
    if (subiendo || !archivo) return;
    onEnviar(caption.trim());
  }

  return (
    <Dialog
      open={archivo !== null}
      onOpenChange={(abierto) => {
        // Durante la subida no se cierra: cancelar a mitad dejaría al asesor sin saber si el
        // archivo llegó o no.
        if (!abierto && !subiendo) onCancelar();
      }}
    >
      <DialogContent className="max-w-lg gap-0 p-0">
        {archivo && (
          <>
            <DialogHeader className="border-b border-border px-5 py-3.5">
              <DialogTitle className="truncate text-base">{archivo.name}</DialogTitle>
              <DialogDescription>{formatearTamano(archivo.size)}</DialogDescription>
            </DialogHeader>

            <VistaPrevia archivo={archivo} />

            <div className="border-t border-border p-3">
              {subiendo && (
                <div className="mb-2.5 flex items-center gap-2">
                  <Progress value={progreso} className="h-1 flex-1" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {/* `onUploadProgress` acaba cuando el archivo llega a NUESTRO backend, no
                        cuando Meta lo acepta: sin este cambio la barra se queda clavada en 100 %
                        unos segundos y parece colgada. */}
                    {progreso < 100 ? `${progreso}%` : 'Enviando a WhatsApp…'}
                  </span>
                </div>
              )}

              <div className="flex items-end gap-2">
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  placeholder="Añade un comentario…"
                  disabled={subiendo}
                  rows={1}
                  autoFocus
                  className="max-h-28 min-h-[40px] resize-none"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={enviar}
                  disabled={subiendo}
                  aria-label="Enviar archivo"
                  className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
                >
                  <Send />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function iconoDe(mimeType: string): typeof FileIcon {
  if (mimeType.includes('pdf') || mimeType.startsWith('text/')) return FileText;
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return FileSpreadsheet;
  }
  return FileIcon;
}

/** El archivo a tamaño de revisión. Un documento no se puede previsualizar: se describe. */
function VistaPrevia({ archivo }: { archivo: File }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const tipo = clasificarArchivo(archivo);

  useEffect(() => {
    if (tipo !== 'imagen' && tipo !== 'video') {
      setUrl(null);
      return;
    }

    const nuevo = URL.createObjectURL(archivo);
    setUrl(nuevo);

    // Sin el `revoke`, cada archivo revisado y descartado deja su blob en memoria mientras viva la
    // pestaña.
    return () => URL.revokeObjectURL(nuevo);
  }, [archivo, tipo]);

  if (tipo === 'imagen' && url) {
    return (
      <div className="flex max-h-[55vh] items-center justify-center bg-muted/40 p-4">
        <img src={url} alt="" className="max-h-[50vh] w-auto max-w-full object-contain" />
      </div>
    );
  }

  if (tipo === 'video' && url) {
    return (
      <div className="flex max-h-[55vh] items-center justify-center bg-muted/40 p-4">
        <video src={url} controls preload="metadata" className="max-h-[50vh] w-auto max-w-full rounded" />
      </div>
    );
  }

  const Icono = iconoDe(archivo.type);
  return (
    <div className="flex items-center justify-center gap-3 bg-muted/40 px-5 py-10">
      <Icono className="size-10 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{archivo.name}</p>
        <p className="text-xs text-muted-foreground">{formatearTamano(archivo.size)}</p>
      </div>
    </div>
  );
}

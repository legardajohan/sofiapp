import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatearTamano } from '../lib/media.js';

interface Props {
  archivo: File;
  /** 0-100 mientras sube; `null` si todavía no ha empezado. */
  progreso: number | null;
  onQuitar: () => void;
}

/**
 * El archivo elegido, antes de enviarlo.
 *
 * Existe para que el asesor confirme que adjuntó lo que quería: mandar el documento equivocado a
 * un cliente no se puede deshacer.
 */
export function AttachmentPreview({ archivo, progreso, onQuitar }: Props): React.ReactElement {
  const [miniatura, setMiniatura] = useState<string | null>(null);

  useEffect(() => {
    if (!archivo.type.startsWith('image/')) {
      setMiniatura(null);
      return;
    }

    const url = URL.createObjectURL(archivo);
    setMiniatura(url);
    // Sin el `revokeObjectURL`, cada archivo adjuntado y descartado deja su blob en memoria
    // mientras viva la pestaña.
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const subiendo = progreso !== null;

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-2">
      {miniatura ? (
        <img src={miniatura} alt="" className="size-10 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-background">
          <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{archivo.name}</p>
        {subiendo ? (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress value={progreso} className="h-1 flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground">
              {/* `onUploadProgress` de axios termina cuando el archivo llega a NUESTRO backend, no
                  cuando Meta lo acepta. Sin este cambio de texto, la barra se queda clavada en
                  100 % unos segundos y parece colgada. */}
              {progreso < 100 ? `${progreso}%` : 'Enviando a WhatsApp…'}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{formatearTamano(archivo.size)}</p>
        )}
      </div>

      {!subiendo && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onQuitar}
          aria-label="Quitar archivo"
          className="size-8 shrink-0"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

import { Download } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { urlDeArchivo } from '../lib/media.js';

interface Props {
  url: string | null;
  alt: string;
  onClose: () => void;
}

/**
 * Imagen a tamaño completo, dentro del CRM.
 *
 * Sobre el `Dialog` ya vendorizado: Radix da el foco atrapado, el cierre con `Esc`, el clic fuera y
 * el `aria-modal` sin escribir nada de eso a mano. El `DialogTitle` va en `sr-only` porque el título
 * visible sería ruido sobre la foto, pero sin él el diálogo no tendría nombre accesible.
 *
 * El contenedor se queda sin fondo ni borde: lo que se está mirando es la imagen, y una tarjeta
 * alrededor solo añadiría marco.
 */
export function MediaLightbox({ url, alt, onClose }: Props): React.ReactElement {
  return (
    <Dialog open={url !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-w-[92vw] border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {url && (
          <div className="flex flex-col items-center gap-3">
            <img
              src={urlDeArchivo(url)}
              alt={alt}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
            />
            <Button asChild variant="secondary" size="sm">
              <a href={urlDeArchivo(url, true)} target="_blank" rel="noopener noreferrer">
                <Download className="size-4" aria-hidden="true" />
                Descargar
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

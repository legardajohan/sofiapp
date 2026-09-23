import { urlDeArchivo } from '../../lib/media.js';
import type { MediaDTO } from '../../types.js';
import { MediaFallida } from './MediaEstado.js';

/**
 * Nota de voz o archivo de audio.
 *
 * Reproductor nativo: uno propio exigiría una barra de progreso, una forma de onda y gestión de
 * estado a mano, por una ganancia estética. El nativo es accesible por teclado y funciona en todos
 * los navegadores desde el primer día.
 */
export function MediaAudio({ media }: { media: MediaDTO }): React.ReactElement {
  if (!media.urlArchivo) {
    return <MediaFallida media={{ ...media, error: media.error ?? 'El audio ya no está disponible.' }} />;
  }

  return (
    <audio controls preload="metadata" className="h-10 w-60 max-w-full">
      <source src={urlDeArchivo(media.urlArchivo)} type={media.mimeType} />
      Tu navegador no puede reproducir este audio.
    </audio>
  );
}

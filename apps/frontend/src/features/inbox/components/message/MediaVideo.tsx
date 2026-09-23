import { urlDeArchivo } from '../../lib/media.js';
import type { MediaDTO } from '../../types.js';
import { MediaFallida } from './MediaEstado.js';

/**
 * Video reproducible dentro del hilo.
 *
 * `preload="metadata"` y no `auto`: trae el primer fotograma y la duración —suficiente para que el
 * asesor vea de qué va— sin descargar megabytes de cada video que pase por la bandeja.
 *
 * Controles nativos a propósito: uno propio exigiría barra de progreso, volumen y pantalla completa
 * hechos a mano, y los nativos ya son accesibles por teclado en los cuatro navegadores.
 */
export function MediaVideo({ media }: { media: MediaDTO }): React.ReactElement {
  if (!media.urlArchivo) {
    return <MediaFallida media={{ ...media, error: media.error ?? 'El video ya no está disponible.' }} />;
  }

  return (
    <video
      controls
      preload="metadata"
      playsInline
      className="w-60 max-w-full rounded-lg bg-black"
    >
      <source src={urlDeArchivo(media.urlArchivo)} type={media.mimeType} />
      Tu navegador no puede reproducir este video.
    </video>
  );
}

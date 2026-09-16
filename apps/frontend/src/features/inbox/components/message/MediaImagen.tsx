import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { MediaDTO } from '../../types.js';
import { MediaFallida } from './MediaEstado.js';

interface Props {
  media: MediaDTO;
  alt: string;
  /** Un sticker se pinta sin marco ni fondo, como en WhatsApp. */
  sticker?: boolean;
  onAbrir: () => void;
}

/**
 * Imagen recibida o enviada, en el tamaño del hilo.
 *
 * La miniatura es la propia imagen reescalada por CSS y no una generada en servidor: hacerlo allí
 * exigiría `sharp` (binario nativo) para un hilo donde las fotos rara vez pasan de 5 MB.
 */
export function MediaImagen({ media, alt, sticker = false, onAbrir }: Props): React.ReactElement {
  const [roto, setRoto] = useState(false);

  if (roto || !media.urlArchivo) {
    return <MediaFallida media={{ ...media, error: media.error ?? 'La imagen ya no está disponible.' }} />;
  }

  if (sticker) {
    return (
      <img
        src={media.urlArchivo}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setRoto(true)}
        className="size-32 object-contain"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Abrir ${alt} en tamaño completo`}
      className={cn(
        'group block w-60 max-w-full overflow-hidden rounded-lg',
        'ring-offset-background transition-transform duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'active:scale-[0.99]',
      )}
    >
      {/* `aspect-[4/3]` fija el hueco antes de que la imagen cargue: sin esto, cada foto que llega
          empuja el hilo hacia abajo y el asesor pierde la línea que estaba leyendo. */}
      <div className="aspect-[4/3] w-full bg-muted">
        <img
          src={media.urlArchivo}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setRoto(true)}
          className="size-full object-cover"
        />
      </div>
    </button>
  );
}

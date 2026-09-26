import { urlDeArchivo } from '../../lib/media.js';
import type { MediaDTO } from '../../types.js';
import { MediaFallida } from './MediaEstado.js';
import { ReproductorAudio } from './ReproductorAudio.js';

interface Props {
  /** Id del mensaje: identidad del reproductor y semilla de su onda. */
  messageId: string;
  media: MediaDTO;
  outbound: boolean;
}

/**
 * Nota de voz o archivo de audio del hilo.
 *
 * Desde HU-OMNI-07 usa un reproductor propio en vez del `<audio controls>` nativo de HU-OMNI-06:
 * la historia pide ver la duración y avanzar como en WhatsApp, y el nativo ocupaba toda la burbuja
 * con controles que cada navegador pinta distinto (y que en dark no respetan el tema).
 */
export function MediaAudio({ messageId, media, outbound }: Props): React.ReactElement {
  if (!media.urlArchivo) {
    return <MediaFallida media={{ ...media, error: media.error ?? 'El audio ya no está disponible.' }} />;
  }

  return (
    <ReproductorAudio
      id={messageId}
      src={urlDeArchivo(media.urlArchivo)}
      duracionSegundos={media.duracionSegundos}
      esNotaDeVoz={media.esNotaDeVoz}
      tono={outbound ? 'saliente' : 'entrante'}
    />
  );
}

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortTime } from '../lib/format.js';
import type { MessageDTO } from '../types.js';
import { MessageStatus } from './MessageStatus.js';
import { MediaAudio } from './message/MediaAudio.js';
import { MediaDocumento } from './message/MediaDocumento.js';
import { MediaFallida, MediaPendiente } from './message/MediaEstado.js';
import { MediaImagen } from './message/MediaImagen.js';
import { MediaVideo } from './message/MediaVideo.js';
import { PreviewEnlace } from './message/PreviewEnlace.js';

/** Qué se dice mientras el archivo viaja desde WhatsApp, por tipo. */
const DESCARGANDO: Partial<Record<MessageDTO['tipo'], string>> = {
  imagen: 'Descargando imagen…',
  video: 'Descargando video…',
  audio: 'Descargando audio…',
  documento: 'Descargando documento…',
  sticker: 'Descargando sticker…',
};

/** Etiqueta para el `alt` y el nombre accesible del lightbox. */
function describir(m: MessageDTO): string {
  if (m.texto) return m.texto;
  return m.direccion === 'inbound' ? 'Imagen recibida' : 'Imagen enviada';
}

interface Props {
  message: MessageDTO;
  onAbrirImagen: (url: string, alt: string) => void;
}

/**
 * Una burbuja del hilo.
 *
 * Extraída de `ConversationThread`, donde vivía dentro del `.map()`: con un solo tipo de contenido
 * cabía ahí, pero ramificar por seis tipos dentro de un `map` deja el componente del hilo
 * ilegible.
 */
export function MessageBubble({ message, onAbrirImagen }: Props): React.ReactElement {
  const outbound = message.direccion === 'outbound';
  // Saber si respondió Sofi o una persona cambia cómo se lee el hilo: sin esta marca, el asesor no
  // distingue lo que él escribió de lo que contestó la IA por él (HU-IA-01).
  const deSofi = outbound && message.sender === 'bot';

  const media = message.media;
  const esImagen = message.tipo === 'imagen' || message.tipo === 'sticker';
  // Imagen y video llenan la burbuja de borde a borde; el padding del texto les dejaría un marco
  // que en WhatsApp no existe.
  const sinPadding = !!media && media.estado === 'disponible' && (esImagen || message.tipo === 'video');

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl text-sm shadow-sm',
          sinPadding ? 'overflow-hidden p-1' : 'px-3.5 py-2',
          outbound
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm border border-border bg-card text-card-foreground',
        )}
      >
        {media ? (
          <Contenido message={message} onAbrirImagen={onAbrirImagen} />
        ) : message.texto ? (
          <>
            <p className="whitespace-pre-wrap break-words">{message.texto}</p>
            {message.previewEnlace && (
              <PreviewEnlace preview={message.previewEnlace} outbound={outbound} />
            )}
          </>
        ) : (
          <p className="italic opacity-80">Mensaje sin contenido</p>
        )}

        <div
          className={cn(
            'flex items-center justify-end gap-1 text-[10px]',
            sinPadding ? 'px-2 pb-0.5 pt-1' : 'mt-1',
            outbound ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {deSofi && (
            <span className="mr-auto flex items-center gap-1 font-medium">
              <Sparkles className="size-2.5" aria-hidden="true" />
              Sofi
            </span>
          )}
          <span>{shortTime(message.createdAt)}</span>
          {outbound && <MessageStatus status={message.status} />}
        </div>
      </div>
    </div>
  );
}

/** Ramificación por tipo. Separada para que la burbuja no mezcle layout con despacho. */
function Contenido({ message, onAbrirImagen }: Props): React.ReactElement {
  const media = message.media!;
  const outbound = message.direccion === 'outbound';

  if (media.estado === 'pendiente') {
    return <MediaPendiente etiqueta={DESCARGANDO[message.tipo] ?? 'Descargando archivo…'} />;
  }
  if (media.estado === 'fallida') {
    return <MediaFallida media={media} />;
  }

  const pie = message.texto ? (
    <p className={cn('whitespace-pre-wrap break-words', message.tipo === 'documento' ? 'mt-1.5' : 'mt-1.5 px-2')}>
      {message.texto}
    </p>
  ) : null;

  switch (message.tipo) {
    case 'imagen':
    case 'sticker':
      return (
        <>
          <MediaImagen
            media={media}
            alt={describir(message)}
            sticker={message.tipo === 'sticker'}
            onAbrir={() => media.urlArchivo && onAbrirImagen(media.urlArchivo, describir(message))}
          />
          {pie}
        </>
      );
    case 'video':
      return (
        <>
          <MediaVideo media={media} />
          {pie}
        </>
      );
    case 'audio':
      return <MediaAudio media={media} />;
    default:
      // `documento` y cualquier tipo con archivo que no sepamos pintar: la tarjeta con nombre,
      // formato y tamaño siempre es mejor que un hueco vacío.
      return (
        <>
          <MediaDocumento media={media} outbound={outbound} />
          {message.texto && <p className="mt-1.5 whitespace-pre-wrap break-words">{message.texto}</p>}
        </>
      );
  }
}

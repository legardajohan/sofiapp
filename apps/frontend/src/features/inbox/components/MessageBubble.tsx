import { Megaphone, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

/**
 * Tipo con el que se PINTA el mensaje. Coincide con `tipo` salvo en una plantilla con cabecera
 * multimedia (HU-MARK-05): el backend la guarda como `plantilla` —el cupo diario de Meta cuenta por
 * ese tipo— pero en la burbuja es una imagen con su texto, no una tarjeta de documento.
 */
function tipoVisual(m: MessageDTO): MessageDTO['tipo'] {
  if (m.tipo !== 'plantilla' || !m.media) return m.tipo;
  const mime = m.media.mimeType;
  if (mime.startsWith('image/')) return 'imagen';
  if (mime.startsWith('video/')) return 'video';
  return 'documento';
}

/** Etiqueta para el `alt` y el nombre accesible del lightbox. */
function describir(m: MessageDTO): string {
  if (m.texto) return m.texto;
  return m.direccion === 'inbound' ? 'Imagen recibida' : 'Imagen enviada';
}

interface Props {
  message: MessageDTO;
  onAbrirImagen: (url: string, alt: string) => void;
  /** Reintenta la descarga de una media fallida. Ausente = no se ofrece la acción. */
  onReintentarMedia?: (messageId: string) => void;
  reintentandoId?: string | null;
  /**
   * Desde dónde se mira el hilo (HU-IA-08). `asesor` —la bandeja— pone a la derecha lo que la
   * empresa envía. `cliente` —el chat de prueba— lo invierte: quien escribe es el admin haciendo de
   * cliente, así que SUS mensajes van a la derecha y lo que contesta Sofi a la izquierda.
   */
  perspectiva?: 'asesor' | 'cliente';
}

/**
 * Una burbuja del hilo.
 *
 * Extraída de `ConversationThread`, donde vivía dentro del `.map()`: con un solo tipo de contenido
 * cabía ahí, pero ramificar por seis tipos dentro de un `map` deja el componente del hilo
 * ilegible.
 */
export function MessageBubble({
  message,
  onAbrirImagen,
  onReintentarMedia,
  reintentandoId,
  perspectiva = 'asesor',
}: Props): React.ReactElement {
  const outbound = message.direccion === 'outbound';
  // Lado y color de la burbuja: `propio` es lo que "yo" escribí desde donde miro el hilo. La marca de
  // Sofi, la de campaña y los ticks de entrega siguen dependiendo de `outbound`, que es un hecho del
  // mensaje y no de la perspectiva.
  const propio = perspectiva === 'cliente' ? !outbound : outbound;
  // Saber si respondió Sofi o una persona cambia cómo se lee el hilo: sin esta marca, el asesor no
  // distingue lo que él escribió de lo que contestó la IA por él (HU-IA-01).
  // Una campaña también sale como `bot`, pero firmarla "Sofi" haría creer al asesor que la IA le
  // escribió al cliente por su cuenta (HU-MARK-05). Lleva su propia etiqueta.
  const deCampana = outbound && message.origen === 'campana';
  const deSofi = outbound && message.sender === 'bot' && !deCampana;

  const media = message.media;
  const tipo = tipoVisual(message);
  const esImagen = tipo === 'imagen' || tipo === 'sticker';
  // Imagen y video llenan la burbuja de borde a borde; el padding del texto les dejaría un marco
  // que en WhatsApp no existe.
  const sinPadding = !!media && media.estado === 'disponible' && (esImagen || tipo === 'video');

  return (
    <div className={cn('flex', propio ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl text-sm shadow-sm',
          sinPadding ? 'overflow-hidden p-1' : 'px-3.5 py-2',
          propio
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm border border-border bg-card text-card-foreground',
        )}
      >
        {media ? (
          <Contenido
            message={message}
            onAbrirImagen={onAbrirImagen}
            {...(onReintentarMedia ? { onReintentarMedia } : {})}
            reintentandoId={reintentandoId ?? null}
          />
        ) : message.texto ? (
          <>
            <p className="whitespace-pre-wrap break-words">{message.texto}</p>
            {message.previewEnlace && (
              <PreviewEnlace preview={message.previewEnlace} outbound={outbound} />
            )}
          </>
        ) : (
          // Una plantilla sin texto es un envío real del que no quedó copia (anterior a HU-MARK-05
          // y no recuperable): decir "sin contenido" haría pensar que no se mandó nada.
          <p className="italic opacity-80">
            {message.tipo === 'plantilla'
              ? 'Plantilla enviada · contenido no disponible'
              : 'Mensaje sin contenido'}
          </p>
        )}

        <div
          className={cn(
            'flex items-center justify-end gap-1 text-[10px]',
            sinPadding ? 'px-2 pb-0.5 pt-1' : 'mt-1',
            propio ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {deSofi && (
            <span className="mr-auto flex items-center gap-1 font-medium">
              <Sparkles className="size-2.5" aria-hidden="true" />
              Sofi
            </span>
          )}
          {deCampana && <EtiquetaCampana nombre={message.campana?.nombre ?? null} />}
          <span>{shortTime(message.createdAt)}</span>
          {/* Los ticks de entrega son del asesor: en el chat de prueba nada viaja por WhatsApp. */}
          {outbound && perspectiva === 'asesor' && <MessageStatus status={message.status} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Marca discreta de "esto lo envió una campaña" (HU-MARK-05). Mismo tamaño, peso y color que la de
 * Sofi para no cambiar la lectura del hilo; el nombre de la campaña va en el tooltip, que es donde
 * lo busca quien lo necesita sin ensuciar cada burbuja.
 *
 * Sin animación propia: se ve decenas de veces al día, y el tooltip ya trae la suya de shadcn.
 */
function EtiquetaCampana({ nombre }: { nombre: string | null }): React.ReactElement {
  const descripcion = nombre ? `Enviado por la campaña «${nombre}»` : 'Enviado por una campaña';
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={descripcion}
            className="mr-auto flex cursor-default items-center gap-1 rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
          >
            <Megaphone className="size-2.5" aria-hidden="true" />
            Campaña
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{descripcion}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Ramificación por tipo. Separada para que la burbuja no mezcle layout con despacho. */
function Contenido({
  message,
  onAbrirImagen,
  onReintentarMedia,
  reintentandoId,
}: Props): React.ReactElement {
  const media = message.media!;
  const outbound = message.direccion === 'outbound';
  const tipo = tipoVisual(message);

  if (media.estado === 'pendiente') {
    return <MediaPendiente etiqueta={DESCARGANDO[message.tipo] ?? 'Descargando archivo…'} />;
  }
  if (media.estado === 'fallida') {
    return (
      <MediaFallida
        media={media}
        {...(onReintentarMedia ? { onReintentar: () => onReintentarMedia(message.id) } : {})}
        reintentando={reintentandoId === message.id}
      />
    );
  }

  const pie = message.texto ? (
    <p className={cn('whitespace-pre-wrap break-words', tipo === 'documento' ? 'mt-1.5' : 'mt-1.5 px-2')}>
      {message.texto}
    </p>
  ) : null;

  switch (tipo) {
    case 'imagen':
    case 'sticker':
      return (
        <>
          <MediaImagen
            media={media}
            alt={describir(message)}
            sticker={tipo === 'sticker'}
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
      return <MediaAudio messageId={message.id} media={media} outbound={outbound} />;
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

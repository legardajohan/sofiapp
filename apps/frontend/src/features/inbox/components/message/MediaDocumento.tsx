import { Download, FileSpreadsheet, FileText, File as FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaDTO } from '../../types.js';
import { etiquetaFormato, formatearTamano, urlDeArchivo } from '../../lib/media.js';
import { MediaFallida } from './MediaEstado.js';

function iconoDe(mimeType: string): typeof FileIcon {
  if (mimeType.includes('pdf') || mimeType.startsWith('text/')) return FileText;
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return FileSpreadsheet;
  }
  return FileIcon;
}

/**
 * Documento: nombre, formato y peso, con acción de abrir.
 *
 * Aquí la tarjeta sí es la forma correcta —un archivo es un objeto discreto con metadatos— a
 * diferencia de usarla por defecto para todo. El borde es completo y no una franja lateral de
 * color, que es decoración disfrazada de jerarquía.
 */
export function MediaDocumento({
  media,
  outbound,
}: {
  media: MediaDTO;
  outbound: boolean;
}): React.ReactElement {
  if (!media.urlArchivo) {
    return (
      <MediaFallida media={{ ...media, error: media.error ?? 'El documento ya no está disponible.' }} />
    );
  }

  const Icono = iconoDe(media.mimeType);
  const nombre = media.nombreArchivo ?? 'Documento';
  const formato = etiquetaFormato(media.mimeType, media.nombreArchivo);

  return (
    <a
      href={urlDeArchivo(media.urlArchivo, true)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex w-64 max-w-full items-center gap-3 rounded-lg border p-2.5',
        'ring-offset-background transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // Dentro de una burbuja saliente el fondo ya es `primary`, así que el contraste tiene que
        // venir de una transparencia del propio texto y no de un gris que se vería lavado.
        outbound
          ? 'border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/20'
          : 'border-border bg-muted/50 hover:bg-muted',
      )}
    >
      <Icono
        className={cn('size-7 shrink-0', outbound ? 'text-primary-foreground' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{nombre}</span>
        <span className={cn('block text-xs', outbound ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
          {formato}
          {media.tamanoBytes ? ` · ${formatearTamano(media.tamanoBytes)}` : ''}
        </span>
      </span>
      <Download
        className={cn('size-4 shrink-0', outbound ? 'text-primary-foreground/75' : 'text-muted-foreground')}
        aria-hidden="true"
      />
    </a>
  );
}

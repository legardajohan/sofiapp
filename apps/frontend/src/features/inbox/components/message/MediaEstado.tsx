import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { MediaDTO } from '../../types.js';

/**
 * Hueco del archivo mientras se descarga desde WhatsApp.
 *
 * Reserva el espacio con una proporción fija: el hilo está auto-scrolleado al fondo y, si la imagen
 * apareciera de golpe empujando el contenido, el asesor perdería el sitio donde estaba leyendo.
 */
export function MediaPendiente({ etiqueta }: { etiqueta: string }): React.ReactElement {
  return (
    <div className="w-60 max-w-full">
      <Skeleton className="aspect-[4/3] w-full rounded-lg" />
      <p className="mt-1.5 text-xs text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

/**
 * El archivo no se pudo traer y ya no se va a reintentar.
 *
 * Dice qué pasó y qué hacer, sin disculparse: el asesor necesita poder actuar —pedirle al cliente
 * que lo reenvíe— no un mensaje de error que se lamente.
 */
export function MediaFallida({ media }: { media: MediaDTO }): React.ReactElement {
  return (
    <div className="flex w-60 max-w-full items-start gap-2 rounded-lg border border-border bg-destructive-subtle p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-foreground">
        {media.error ?? 'No se pudo descargar el archivo.'}
      </p>
    </div>
  );
}

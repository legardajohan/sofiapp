import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PreviewEnlaceDTO } from '../../types.js';

/**
 * Tarjeta de un enlace compartido: dominio y URL.
 *
 * **Sin título ni imagen a propósito.** La Cloud API de WhatsApp no envía metadata Open Graph en
 * los webhooks entrantes, así que del lado receptor no existen. Inventarlas exigiría descargar la
 * URL desde el servidor —superficie de SSRF con URLs que escribe cualquiera— por una tarjeta más
 * bonita. La tarjeta rica sí la ve el cliente en su teléfono: los textos salientes se envían con
 * `preview_url: true` y la renderiza WhatsApp.
 *
 * Borde completo y no una franja lateral de color: una franja de acento es decoración disfrazada
 * de jerarquía, y aquí no hay jerarquía que comunicar.
 */
export function PreviewEnlace({
  preview,
  outbound,
}: {
  preview: PreviewEnlaceDTO;
  outbound: boolean;
}): React.ReactElement {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'mt-1.5 flex items-center gap-2 rounded-lg border px-2.5 py-2',
        'ring-offset-background transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        outbound
          ? 'border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/20'
          : 'border-border bg-muted/50 hover:bg-muted',
      )}
    >
      <Link2
        className={cn('size-4 shrink-0', outbound ? 'text-primary-foreground/75' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{preview.dominio}</span>
        <span
          className={cn(
            'block truncate text-xs',
            outbound ? 'text-primary-foreground/75' : 'text-muted-foreground',
          )}
        >
          {preview.url}
        </span>
      </span>
    </a>
  );
}

import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ETIQUETA_ESTADO } from '../lib/pacing.js';
import type { EstadoCampana } from '../types.js';

/**
 * Variante del chip por estado.
 *
 * `cancelada` NO es destructiva: cancelar es una decisión del administrador, no un fallo del
 * sistema, y pintarla en rojo junto a `fallida` haría que las dos se leyeran igual de mal.
 */
const VARIANTE: Record<EstadoCampana, 'default' | 'secondary' | 'destructive' | 'success' | 'outline'> =
  {
    borrador: 'outline',
    programada: 'secondary',
    en_curso: 'default',
    pausada: 'secondary',
    completada: 'success',
    cancelada: 'outline',
    fallida: 'destructive',
  };

/** «8:00» si es hoy; «lun 8:00» si es otro día. Corto: vive dentro de un chip. */
function horaDeReanudacion(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  const hora = fecha.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  if (fecha.toDateString() === ahora.toDateString()) return hora;
  const dia = fecha.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  return `${dia} ${hora}`;
}

interface Props {
  estado: EstadoCampana;
  /** HU-CONF-01: en curso pero esperando a que abra el horario de envío. */
  retenidaHasta?: string | null;
}

export function CampaignStatusBadge({ estado, retenidaHasta }: Props): React.ReactElement {
  if (estado === 'en_curso' && retenidaHasta) {
    // No es un fallo ni una pausa del admin: es el horario de la empresa. Tono secundario, con la
    // hora a la que sigue sola para que nadie la "reanude" a mano.
    return (
      <Badge variant="secondary" className="gap-1 whitespace-nowrap">
        <Clock className="size-3" aria-hidden="true" />
        Retenida por horario · reanuda {horaDeReanudacion(retenidaHasta)}
      </Badge>
    );
  }
  return <Badge variant={VARIANTE[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
}

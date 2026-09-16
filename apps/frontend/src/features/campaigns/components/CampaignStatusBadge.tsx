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

export function CampaignStatusBadge({ estado }: { estado: EstadoCampana }): React.ReactElement {
  return <Badge variant={VARIANTE[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
}

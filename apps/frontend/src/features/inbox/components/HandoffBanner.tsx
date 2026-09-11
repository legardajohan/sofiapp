import { ArrowRightLeft } from 'lucide-react';
import { MOTIVO_LABEL, type HandoffMotivo } from '@/features/handoff/types';
import { shortTime } from '../lib/format.js';

interface HandoffBannerProps {
  motivo: HandoffMotivo;
  at: string;
  /**
   * La condición propia del admin que lo disparó (HU-IA-07). Cuando llega se pinta su nombre: el
   * asesor entiende «facturación» mucho mejor que «cumplió una de tus condiciones». Y como el
   * nombre viene grabado en la conversación, sigue siendo el correcto aunque el admin la renombre.
   */
  condicion?: { key: string; nombre: string } | null;
}

/**
 * Aviso de que Sofi transfirió esta conversación (HU-IA-03). Va sobre el compositor, en el mismo
 * sitio que `WindowClosedBanner`: es donde el asesor mira justo antes de escribir.
 *
 * En tokens **neutros**, no en `destructive`: un handoff no es un error ni algo que haya que
 * arreglar — es el sistema funcionando. Pintarlo en rojo enseñaría a ignorar el rojo de verdad,
 * que es el de la ventana de 24 h cerrada.
 */
export function HandoffBanner({
  motivo,
  at,
  condicion = null,
}: HandoffBannerProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-secondary-foreground">
      <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Sofi te pasó esta conversación
        <span className="text-muted-foreground">
          {' '}
          · {(condicion?.nombre ?? MOTIVO_LABEL[motivo]).toLowerCase()}
        </span>
        <span className="text-muted-foreground"> · {shortTime(at)}</span>
      </span>
      <span className="ml-auto shrink-0 text-muted-foreground">
        No responde hasta que reactives a Sofi
      </span>
    </div>
  );
}

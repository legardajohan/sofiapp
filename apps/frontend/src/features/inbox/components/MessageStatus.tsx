import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageStatus as Status } from '../types.js';

/** Indicador de entrega estilo WhatsApp para mensajes salientes. */
export function MessageStatus({ status }: { status: Status }): React.ReactElement {
  switch (status) {
    case 'read':
      return <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="Leído" />;
    case 'delivered':
      return <CheckCheck className="h-3.5 w-3.5 text-current opacity-70" aria-label="Entregado" />;
    case 'failed':
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Falló" />;
    case 'sent':
    default:
      return <Check className={cn('h-3.5 w-3.5 text-current opacity-70')} aria-label="Enviado" />;
  }
}

export function PendingStatus(): React.ReactElement {
  return <Clock className="h-3.5 w-3.5 text-current opacity-70" aria-label="Enviando" />;
}

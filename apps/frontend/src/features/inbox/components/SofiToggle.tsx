import { Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface Props {
  enabled: boolean;
  pending: boolean;
  onToggle: (value: boolean) => void;
}

/** Activa/desactiva a Sofi (IA) para esta conversación. */
export function SofiToggle({ enabled, pending, onToggle }: Props): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Sparkles className={cn('h-4 w-4 transition-colors', enabled ? 'text-primary' : 'text-muted-foreground')} />
      <span className="text-xs font-medium text-foreground">Sofi</span>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={pending}
        aria-label="Activar respuestas de Sofi"
      />
    </div>
  );
}

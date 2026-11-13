import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGuardarPreferencia, usePreferenciaOrganizador } from '../hooks/useOrganizador.js';

/**
 * «Activar Organizador y recordatorios» (HU-PDF-02 §3.1). Se guarda por usuario en el servidor:
 * sobrevive a recargas y a cerrar sesión. Apagarlo solo silencia los avisos; nada se borra.
 */
export function OrganizadorSwitch(): React.ReactElement {
  const { data, isLoading } = usePreferenciaOrganizador();
  const guardar = useGuardarPreferencia();
  const activo = data?.activo ?? true;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Switch
        id="organizador-activo"
        checked={activo}
        disabled={isLoading}
        onCheckedChange={(v) => guardar.mutate(v)}
        aria-describedby="organizador-activo-ayuda"
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor="organizador-activo" className="cursor-pointer text-sm font-medium">
          Activar Organizador y recordatorios
        </Label>
        <p id="organizador-activo-ayuda" className="text-xs text-muted-foreground">
          {activo
            ? 'Te avisaremos cuando venza un pendiente de tus notas.'
            : 'No verás avisos. Tus pendientes y su historial se conservan.'}
        </p>
      </div>
    </div>
  );
}

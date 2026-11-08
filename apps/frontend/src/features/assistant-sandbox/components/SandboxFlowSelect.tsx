import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFlows } from '../../flows/hooks/useFlows.js';
import type { SandboxSession } from '../types.js';

/** Valor del `Select` para «el flujo activo»: Radix no admite `value=""` en un ítem. */
const FLUJO_ACTIVO = '__activo__';

interface Props {
  session: SandboxSession;
  disabled: boolean;
  onChange: (flowId: string | null) => void;
}

/**
 * Qué flujo se prueba. Por defecto, el mismo que verían los clientes reales; también se puede elegir
 * uno inactivo, que es la forma de validar un flujo antes de activarlo.
 */
export function SandboxFlowSelect({ session, disabled, onChange }: Props): React.ReactElement {
  const { data: flows } = useFlows();
  const activo = session.flujoActivo;

  const etiquetaActivo = activo ? `Flujo activo: ${activo.nombre}` : 'Sin flujo activo (responde Sofi)';

  return (
    <Select
      value={session.flujo?.id ?? FLUJO_ACTIVO}
      onValueChange={(v) => onChange(v === FLUJO_ACTIVO ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 min-w-0 max-w-full text-xs sm:max-w-72" aria-label="Flujo a probar">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FLUJO_ACTIVO}>{etiquetaActivo}</SelectItem>
        {(flows ?? [])
          .filter((f) => f.id !== activo?.id)
          .map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.nombre} · inactivo
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

import type { LucideIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface TriggerCardProps {
  id: string;
  icon: LucideIcon;
  titulo: string;
  /** Qué le pasa al cliente cuando esto se cumple. En sus términos, no en los del sistema. */
  descripcion: string;
  activa: boolean;
  disabled: boolean;
  onToggle: (activa: boolean) => void;
  /**
   * Acciones sobre el disparador en sí (editar, eliminar). Solo las condiciones propias del admin
   * las traen (HU-IA-07): las cuatro de fábrica no se editan ni se borran.
   *
   * Es un slot y no un componente aparte porque una condición propia **es** un disparador; lo único
   * que cambia es que además se puede modificar.
   */
  acciones?: React.ReactNode;
  /** Parámetros propios del disparador. Solo se muestran cuando está encendido. */
  children?: React.ReactNode;
}

/**
 * Un disparador de handoff. La tarjeta es la unidad de decisión del admin: un interruptor, una
 * frase que explica qué provoca, y —solo si está encendido— sus parámetros.
 *
 * Los parámetros se **ocultan** en vez de deshabilitarse: apagados no son accionables y solo
 * añadirían ruido a una pantalla que ya tiene cuatro bloques. Al encender, aparecen donde el ojo
 * ya está mirando.
 */
export function TriggerCard({
  id,
  icon: Icon,
  titulo,
  descripcion,
  activa,
  disabled,
  onToggle,
  acciones,
  children,
}: TriggerCardProps): React.ReactElement {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-5 shadow-card transition-opacity ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
            activa && !disabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <Icon
            className={`size-4 ${activa && !disabled ? 'text-primary-foreground' : 'text-secondary-foreground'}`}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="text-base font-semibold text-foreground">
            {titulo}
          </label>
          <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-muted-foreground">
            {descripcion}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {acciones}
          <Switch
            id={id}
            checked={activa}
            disabled={disabled}
            onCheckedChange={onToggle}
            aria-describedby={`${id}-ayuda`}
          />
        </div>
      </div>

      {activa && !disabled && children && (
        <div className="mt-4 border-t border-border pt-4">{children}</div>
      )}
    </section>
  );
}

import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Presets de semaforización primero: son el vocabulario compartido con el resto del CRM, así que
 * conviene que las etiquetas nuevas se alineen con ellos salvo que haya una razón para no hacerlo.
 * El resto de la fila cubre los tonos que no chocan con el semáforo.
 */
const PRESETS = [
  { hex: '#16A34A', nombre: 'Verde (avanza)' },
  { hex: '#EA580C', nombre: 'Naranja (requiere atención)' },
  { hex: '#DC2626', nombre: 'Rojo (en riesgo)' },
  { hex: '#2563EB', nombre: 'Azul (informativo)' },
  { hex: '#7C3AED', nombre: 'Violeta' },
  { hex: '#0891B2', nombre: 'Cian' },
  { hex: '#CA8A04', nombre: 'Ámbar' },
  { hex: '#475569', nombre: 'Gris' },
];

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

export function TagColorPicker({ value, onChange }: Props): React.ReactElement {
  const normalizado = value.toUpperCase();

  return (
    <div className="space-y-2.5">
      <Label>Color</Label>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const activo = preset.hex === normalizado;
          return (
            <button
              key={preset.hex}
              type="button"
              onClick={() => onChange(preset.hex)}
              aria-label={preset.nombre}
              aria-pressed={activo}
              title={preset.nombre}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full ring-offset-background',
                'transition-transform duration-150 ease-out motion-safe:active:scale-[0.94]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                activo && 'ring-2 ring-ring ring-offset-2',
              )}
              style={{ backgroundColor: preset.hex }}
            >
              {activo && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {/* El input nativo de color es el control correcto aquí: shadcn no tiene equivalente y
            reimplementar un selector de color a mano sería peor en accesibilidad y en soporte. */}
        <input
          type="color"
          value={normalizado}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label="Elegir un color personalizado"
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <Input
          value={normalizado}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="#2563EB"
          aria-label="Color en hexadecimal"
          className="font-mono text-sm uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

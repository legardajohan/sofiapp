import { useId } from 'react';
import { AlignLeft, ImageIcon } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type TipoEncabezado = 'NINGUNA' | 'IMAGE';

interface Props {
  valor: TipoEncabezado;
  onChange: (valor: TipoEncabezado) => void;
  /** La categoría no admite imagen (Autenticación): la opción queda visible pero inactiva. */
  imagenDisponible: boolean;
}

const OPCIONES: Array<{ valor: TipoEncabezado; titulo: string; detalle: string; Icono: typeof AlignLeft }> = [
  { valor: 'NINGUNA', titulo: 'Solo texto', detalle: 'El mensaje de siempre.', Icono: AlignLeft },
  {
    valor: 'IMAGE',
    titulo: 'Texto + imagen',
    detalle: 'Una imagen encima del texto. Se puede cambiar en cada campaña.',
    Icono: ImageIcon,
  },
];

/**
 * Elegir entre plantilla de solo texto o con imagen (HT-WA-04, criterios 1 y 3).
 *
 * Dos tarjetas en vez de un select: son solo dos opciones y la diferencia se entiende mejor
 * viéndolas juntas. Cuando la categoría no admite imagen, la opción no desaparece —el admin
 * se preguntaría dónde quedó—: se apaga y el porqué se dice debajo, en texto visible y no en un
 * tooltip, que en un control deshabilitado no se puede abrir.
 */
export function HeaderTypeSelector({ valor, onChange, imagenDisponible }: Props): React.ReactElement {
  const hintId = useId();

  return (
    <div className="space-y-1.5">
      <Label>Tipo de encabezado</Label>
      <RadioGroup
        value={valor}
        onValueChange={(v) => onChange(v as TipoEncabezado)}
        className="grid-cols-1 gap-2 sm:grid-cols-2"
        aria-describedby={imagenDisponible ? undefined : hintId}
      >
        {OPCIONES.map(({ valor: opcion, titulo, detalle, Icono }) => {
          const deshabilitada = opcion === 'IMAGE' && !imagenDisponible;
          const id = `encabezado-${opcion}`;
          return (
            <Label
              key={opcion}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal',
                'transition-colors duration-150 ease-out',
                'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5',
                deshabilitada
                  ? 'cursor-not-allowed opacity-60'
                  : '[@media(hover:hover)]:hover:border-foreground/30',
              )}
            >
              <RadioGroupItem id={id} value={opcion} disabled={deshabilitada} className="mt-0.5" />
              <span className="min-w-0 space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Icono className="size-4 text-muted-foreground" aria-hidden="true" />
                  {titulo}
                </span>
                <span className="block text-xs text-muted-foreground">{detalle}</span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {!imagenDisponible && (
        <p id={hintId} className="text-xs text-muted-foreground">
          La imagen solo está disponible para plantillas de Marketing y Utilidad.
        </p>
      )}
    </div>
  );
}

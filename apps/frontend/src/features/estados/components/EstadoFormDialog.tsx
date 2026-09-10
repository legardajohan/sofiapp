import { useEffect, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tagColors } from '@/features/tags/lib/tag-color';
// El selector de color es el mismo que el de las etiquetas a propósito: un solo vocabulario de
// color en todo el CRM, y el control ya resuelve presets, hex libre y accesibilidad.
import { TagColorPicker } from '@/features/tags/components/TagColorPicker';
import { COLOR_ETAPA_DEFECTO, type EstadoDTO } from '../types.js';

export interface ValoresEtapa {
  label: string;
  color: string;
  esSalida: boolean;
}

interface Props {
  /** `null` = alta. Con etapa, edición. */
  estado: EstadoDTO | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onSubmit: (valores: ValoresEtapa) => void;
}

/**
 * Alta y edición de una etapa del embudo.
 *
 * **Lleva una vista previa de la columna, no una muestra del color.** El hex que elige el
 * administrador no se pinta tal cual: pasa por `tagColors`, que lo compone con la superficie del
 * tema y ajusta el texto hasta 4.5:1. Sin la previa, elegir un amarillo y ver una cabecera casi
 * blanca en el tablero parece un fallo; con ella, el resultado se decide aquí.
 *
 * La `key` no se edita y no se muestra: es el valor grabado en cada lead, y ofrecerla invitaría a
 * cambiarla. Renombrar «Pagado» a «Ganado» conserva el vínculo justo porque la clave no se toca.
 */
export function EstadoFormDialog({
  estado,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: Props): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLOR_ETAPA_DEFECTO);
  const [esSalida, setEsSalida] = useState(false);

  // Se recarga al abrir, no al montar: el diálogo vive montado entre aperturas y sin esto la
  // segunda edición llegaría con los valores de la primera.
  useEffect(() => {
    if (!open) return;
    setLabel(estado?.label ?? '');
    setColor(estado?.color ?? COLOR_ETAPA_DEFECTO);
    setEsSalida(estado?.esSalida ?? false);
  }, [open, estado]);

  const limpio = label.trim();
  const editando = estado !== null;
  const chip = tagColors(color, resolvedTheme === 'dark' ? 'dark' : 'light');

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    if (!limpio) return;
    onSubmit({ label: limpio, color, esSalida });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar}>
          <DialogHeader>
            <DialogTitle>{editando ? `Editar «${estado.label}»` : 'Nueva etapa'}</DialogTitle>
            <DialogDescription>
              {editando
                ? 'El nombre y el color cambian en el tablero y en el listado. Los leads que ya están en la etapa se quedan donde están.'
                : 'Se añade al final del embudo, como una columna más del tablero.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="etapa-label">Nombre</Label>
              <Input
                id="etapa-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                placeholder="Visita agendada"
                autoFocus
              />
            </div>

            <TagColorPicker value={color} onChange={setColor} />

            <div className="space-y-1.5">
              <Label>Vista previa en el tablero</Label>
              <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
                <div
                  className="flex items-center gap-2 border-b px-3 py-2.5"
                  style={{ backgroundColor: chip.bg, borderColor: chip.border }}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/15 dark:ring-white/25"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-semibold"
                    style={{ color: chip.fg }}
                  >
                    {limpio || 'Nueva etapa'}
                  </span>
                  {esSalida && (
                    <span
                      className="shrink-0 rounded border px-1.5 py-px text-xs font-medium"
                      style={{ color: chip.fg, borderColor: chip.border }}
                    >
                      Salida
                    </span>
                  )}
                  <span
                    className="shrink-0 text-sm font-semibold tabular-nums"
                    style={{ color: chip.fg }}
                  >
                    {estado?.leads ?? 0}
                  </span>
                </div>
                <div className="h-8" />
              </div>
            </div>

            {/* Solo al editar: una etapa recién creada nace como paso intermedio, y el backend la da
                de alta así. Marcarla de salida es una decisión sobre el embudo ya dibujado. */}
            {editando && (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-3">
                <div className="min-w-0">
                  <Label htmlFor="etapa-salida" className="cursor-pointer">
                    Cierra el embudo
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    El recorrido termina aquí, como «Pagado» o «Perdido». El tablero la señala; no
                    bloquea mover oportunidades fuera de ella.
                  </p>
                </div>
                <Switch
                  id="etapa-salida"
                  checked={esSalida}
                  onCheckedChange={setEsSalida}
                  aria-label="Cierra el embudo"
                />
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!limpio || pending}
              className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
            >
              {pending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear etapa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

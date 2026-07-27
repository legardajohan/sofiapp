import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TagChip } from './TagChip.js';
import { TagColorPicker } from './TagColorPicker.js';
import type { TagDTO } from '../types.js';

interface Props {
  /** `null` = crear; un tag = editar. */
  tag: TagDTO | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (valores: { nombre: string; color: string }) => void;
}

const COLOR_POR_DEFECTO = '#2563EB';
const HEX_VALIDO = /^#[0-9A-Fa-f]{6}$/;

export function TagFormDialog({
  tag,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: Props): React.ReactElement {
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLOR_POR_DEFECTO);

  // Al abrir, el formulario refleja la etiqueta que se va a editar (o queda limpio para crear).
  useEffect(() => {
    if (!open) return;
    setNombre(tag?.nombre ?? '');
    setColor(tag?.color ?? COLOR_POR_DEFECTO);
  }, [open, tag]);

  const nombreLimpio = nombre.trim();
  const colorValido = HEX_VALIDO.test(color);
  const puedeGuardar = nombreLimpio.length > 0 && colorValido && !pending;

  const editando = tag !== null;
  const esSemaforo = tag?.semaforo != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar etiqueta' : 'Crear etiqueta'}</DialogTitle>
          <DialogDescription>
            {esSemaforo
              ? 'Es una etiqueta de semaforización: puedes cambiar su nombre y su color, pero conserva su significado en el resto del CRM.'
              : 'Las etiquetas clasifican conversaciones en la bandeja y sirven para filtrarlas.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (puedeGuardar) onSubmit({ nombre: nombreLimpio, color });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="tag-nombre">Nombre</Label>
            <Input
              id="tag-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Pendiente de pago"
              maxLength={30}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{nombreLimpio.length}/30</p>
          </div>

          <TagColorPicker value={color} onChange={setColor} />

          {/* Vista previa: el administrador ve el chip exacto que aparecerá en la bandeja, ya con
              el contraste corregido para el tema activo. */}
          <div className="space-y-2">
            <Label>Vista previa</Label>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              {colorValido ? (
                <TagChip
                  tag={{
                    id: 'preview',
                    nombre: nombreLimpio || 'Nombre de la etiqueta',
                    color,
                    semaforo: null,
                  }}
                />
              ) : (
                <p className="text-xs text-destructive">
                  El color debe tener el formato #RRGGBB.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!puedeGuardar}>
              {editando ? 'Guardar cambios' : 'Crear etiqueta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

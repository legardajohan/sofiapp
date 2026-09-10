import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateEstado } from '../../estados/hooks/useEstados.js';
import { COLOR_ESTADO_DESCONOCIDO } from '../lib/format.js';

/**
 * Alta de una etapa propia del pipeline (HU-CRM-03).
 *
 * Los cinco de fábrica cubren el caso común, pero el pipeline es de cada empresa: una inmobiliaria
 * quiere "Visita agendada" y un gimnasio "Prueba gratis". Se pide lo mínimo —nombre y color— porque
 * el resto (clave estable y posición al final) lo deriva el backend.
 */
export function NuevoEstadoDialog(): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLOR_ESTADO_DESCONOCIDO);
  const crear = useCreateEstado();

  const limpio = label.trim();

  function enviar(e: React.FormEvent): void {
    e.preventDefault();
    if (!limpio) return;

    crear.mutate(
      { label: limpio, color },
      {
        onSuccess: () => {
          setAbierto(false);
          // No hereda el nombre de la vez anterior: reabrir es empezar de cero.
          setLabel('');
          setColor(COLOR_ESTADO_DESCONOCIDO);
        },
      },
    );
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo estado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar}>
          <DialogHeader>
            <DialogTitle>Nuevo estado</DialogTitle>
            <DialogDescription>
              Se añade al final del pipeline. Podrás usarlo para filtrar el listado.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="estado-label">Nombre</Label>
              <Input
                id="estado-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                placeholder="Visita agendada"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estado-color">Color</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="estado-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer p-1"
                />
                <span className="text-sm text-muted-foreground">{color.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!limpio || crear.isPending}>
              {crear.isPending ? 'Creando…' : 'Crear estado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

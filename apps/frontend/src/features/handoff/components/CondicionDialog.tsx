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
import { slugificar } from '@/features/contacts/lib/slug';
import { TermList } from './TermList.js';
import {
  CONDICION_NOMBRE_MAX,
  CONDICION_NOMBRE_MIN,
  type CondicionExtra,
} from '../types.js';

interface CondicionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La condición que se edita, o `null` para crear una nueva. */
  condicion: CondicionExtra | null;
  /** Claves ya usadas, para que `slugificar` no genere una repetida. */
  keysUsadas: string[];
  onGuardar: (condicion: CondicionExtra) => void;
}

/**
 * Crear o editar una condición de transferencia propia (HU-IA-07).
 *
 * **No guarda contra el servidor**: devuelve la condición al formulario, que la mete en su estado y
 * la persiste con el «Guardar cambios» que ya existe. Un diálogo que guardara por su cuenta
 * rompería el «Descartar cambios» de la página.
 */
export function CondicionDialog({
  open,
  onOpenChange,
  condicion,
  keysUsadas,
  onGuardar,
}: CondicionDialogProps): React.ReactElement {
  const [nombre, setNombre] = useState('');
  const [palabras, setPalabras] = useState<string[]>([]);

  const editando = condicion !== null;

  // Se siembra al abrir, no al montar: el diálogo vive montado y se reutiliza para cada condición.
  useEffect(() => {
    if (!open) return;
    setNombre(condicion?.nombre ?? '');
    setPalabras(condicion?.palabras ?? []);
  }, [open, condicion]);

  const limpio = nombre.trim();
  const puedeGuardar =
    limpio.length >= CONDICION_NOMBRE_MIN &&
    limpio.length <= CONDICION_NOMBRE_MAX &&
    palabras.length > 0;

  function guardar(): void {
    if (!puedeGuardar) return;
    onGuardar({
      // La clave se deriva SOLO al crear. Al editar viaja intacta: si cambiara, esta dejaría de ser
      // la misma condición para las conversaciones que ya se transfirieron por ella.
      key: condicion?.key ?? slugificar(limpio, keysUsadas),
      nombre: limpio,
      activa: condicion?.activa ?? true,
      palabras,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar condición' : 'Nueva condición'}</DialogTitle>
          <DialogDescription>
            Sofi transferirá la conversación cuando el cliente escriba alguna de estas palabras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="condicion-nombre">Nombre</Label>
            <Input
              id="condicion-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={CONDICION_NOMBRE_MAX}
              placeholder="Facturación"
              aria-describedby="condicion-nombre-ayuda"
            />
            <p id="condicion-nombre-ayuda" className="text-xs text-muted-foreground">
              {editando
                ? 'Lo verás en la bandeja cuando Sofi transfiera por esta condición. Las conversaciones que ya se transfirieron conservan el nombre que tenía entonces.'
                : 'Lo verás en la bandeja cuando Sofi transfiera por esta condición.'}
            </p>
          </div>

          {/* El mismo editor de chips de las listas de fábrica: escribir un segundo sería
              inconsistencia visual, no una decisión de diseño. */}
          <TermList
            id="condicion-palabras"
            label="Palabras que la activan"
            ayuda="Coinciden como palabra completa y sin distinguir mayúsculas ni tildes: «factura» no se activa dentro de «facturación»."
            placeholder="factura"
            terminos={palabras}
            onChange={setPalabras}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!puedeGuardar} onClick={guardar}>
            {editando ? 'Guardar condición' : 'Añadir condición'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

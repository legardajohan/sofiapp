import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OPERADOR_LABEL, OPERADORES, type IRamaCondicion } from '../types.js';

export interface OpcionDestino {
  id: string;
  label: string;
}

interface ConditionEditorProps {
  ramas: IRamaCondicion[];
  ramaPorDefecto: string;
  opcionesDestino: OpcionDestino[];
  onChange: (ramas: IRamaCondicion[], ramaPorDefecto: string) => void;
}

function ramaVacia(): IRamaCondicion {
  return { operador: 'igual_a', valor: '', nodoDestino: '' };
}

/**
 * Editor de ramas de un nodo `condicion`: operador + valor + destino, y la rama por defecto. Es la
 * tarea literal de la historia — tiene que ser lo más rápido y evidente del inspector, así que cada
 * rama vive en una sola fila y agregar/quitar no exige más de un clic.
 */
export function ConditionEditor({
  ramas,
  ramaPorDefecto,
  opcionesDestino,
  onChange,
}: ConditionEditorProps): React.ReactElement {
  function actualizarRama(index: number, cambio: Partial<IRamaCondicion>): void {
    const siguiente = ramas.map((r, i) => (i === index ? { ...r, ...cambio } : r));
    onChange(siguiente, ramaPorDefecto);
  }

  function eliminarRama(index: number): void {
    onChange(
      ramas.filter((_, i) => i !== index),
      ramaPorDefecto,
    );
  }

  function agregarRama(): void {
    onChange([...ramas, ramaVacia()], ramaPorDefecto);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Si la respuesta del cliente…
        </Label>
        <div className="space-y-2">
          {ramas.map((rama, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1.5 rounded-md border border-border bg-muted/30 p-1.5"
            >
              <Select
                value={rama.operador}
                onValueChange={(v) => actualizarRama(index, { operador: v as IRamaCondicion['operador'] })}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Operador">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERADORES.map((op) => (
                    <SelectItem key={op} value={op} className="text-xs">
                      {OPERADOR_LABEL[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={rama.valor}
                onChange={(e) => actualizarRama(index, { valor: e.target.value })}
                placeholder={rama.operador === 'opcion_elegida' ? 'Texto de la opción' : 'Valor'}
                className="h-8 text-xs"
                aria-label="Valor a comparar"
              />

              <Select
                value={rama.nodoDestino || undefined}
                onValueChange={(v) => actualizarRama(index, { nodoDestino: v })}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Nodo destino">
                  <SelectValue placeholder="Destino…" />
                </SelectTrigger>
                <SelectContent>
                  {opcionesDestino.map((op) => (
                    <SelectItem key={op.id} value={op.id} className="text-xs">
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => eliminarRama(index)}
                aria-label="Eliminar rama"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={agregarRama}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Agregar rama
        </Button>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <Label className="text-xs text-muted-foreground">
          Si ninguna rama coincide, ir a
        </Label>
        <Select value={ramaPorDefecto || undefined} onValueChange={(v) => onChange(ramas, v)}>
          <SelectTrigger className="h-8 text-xs" aria-label="Rama por defecto">
            <SelectValue placeholder="Elige el nodo por defecto…" />
          </SelectTrigger>
          <SelectContent>
            {opcionesDestino.map((op) => (
              <SelectItem key={op.id} value={op.id} className="text-xs">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

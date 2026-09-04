import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
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

/** A partir de este largo, el valor ya no se lee cómodo en el input compacto de una línea (criterio
 *  6 de HU-FLOW-01-V3): en vez de dejarlo hacer scroll horizontal, se ofrece expandirlo. */
const UMBRAL_EXPANDIR = 28;

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
  const [expandidas, setExpandidas] = useState<Record<number, boolean>>({});

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
          {ramas.map((rama, index) => {
            const esLarga = rama.valor.length > UMBRAL_EXPANDIR;
            const expandida = esLarga && (expandidas[index] ?? false);
            return (
              <div key={index} className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
                {/* Apilado, no en grid de 3 columnas: el panel mide 320-384px y tres selects lado a
                    lado ahí quedan tan angostos que ni el operador ni el destino se leen completos
                    — el mismo problema de fondo que el scroll horizontal del valor. Una fila por
                    control, con el ancho completo del panel, es lo que de verdad lo arregla. */}
                <div className="flex items-center gap-1.5">
                  <Select
                    value={rama.operador}
                    onValueChange={(v) => actualizarRama(index, { operador: v as IRamaCondicion['operador'] })}
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Operador">
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

                <Input
                  value={rama.valor}
                  onChange={(e) => actualizarRama(index, { valor: e.target.value })}
                  placeholder={rama.operador === 'opcion_elegida' ? 'Texto de la opción' : 'Valor'}
                  className="h-8 text-xs"
                  aria-label="Valor a comparar"
                  disabled={expandida}
                />

                {esLarga ? (
                  <button
                    type="button"
                    onClick={() => setExpandidas((prev) => ({ ...prev, [index]: !expandida }))}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {expandida ? 'Ver menos' : 'Ver más'}
                  </button>
                ) : null}

                {/* Truco de `grid-template-rows` 0fr↔1fr: anima el alto sin medir el contenido y sin
                    saltos — el valor completo, con wrap, en vez del scroll horizontal del input. */}
                <div
                  className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    expandida ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                  )}
                >
                  <div className="overflow-hidden">
                    <Textarea
                      value={rama.valor}
                      onChange={(e) => actualizarRama(index, { valor: e.target.value })}
                      rows={2}
                      className="text-xs"
                      aria-label="Valor a comparar (completo)"
                    />
                  </div>
                </div>

                <Select
                  value={rama.nodoDestino || undefined}
                  onValueChange={(v) => actualizarRama(index, { nodoDestino: v })}
                >
                  <SelectTrigger className="h-8 w-full text-xs" aria-label="Nodo destino">
                    <SelectValue placeholder="Ir a…" />
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
            );
          })}
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

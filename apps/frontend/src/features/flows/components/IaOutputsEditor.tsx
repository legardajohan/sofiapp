import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DestinoSelect } from './DestinoSelect.js';
import type { OpcionDestino } from './ConditionEditor.js';
import type { ISalidaIa } from '../types.js';

/** Mismo umbral que `IntencionForm` (criterio 7 de HU-FLOW-01-V3): a partir de este largo, la
 *  descripción de una salida ya no se lee cómoda en el input de una línea. */
const UMBRAL_EXPANDIR = 28;

interface IaOutputsEditorProps {
  salidas: ISalidaIa[];
  opcionesDestino: OpcionDestino[];
  onChange: (salidas: ISalidaIa[]) => void;
}

/**
 * Lista de salidas de un nodo `ia` (HU-FLOW-03): etiqueta corta + descripción (la instrucción
 * real que lee el modelo para decidir si ya se cumplió) + destino. Calca el patrón ya probado de
 * `IntencionForm` — misma expansión "Ver más" para descripciones largas, mismo `DestinoSelect` —
 * para que el vocabulario de edición del constructor no gane un mecanismo nuevo por tipo de nodo.
 */
export function IaOutputsEditor({ salidas, opcionesDestino, onChange }: IaOutputsEditorProps): React.ReactElement {
  const [expandidas, setExpandidas] = useState<Record<number, boolean>>({});

  function actualizar(index: number, cambio: Partial<ISalidaIa>): void {
    onChange(salidas.map((s, i) => (i === index ? { ...s, ...cambio } : s)));
  }

  return (
    <div className="space-y-2">
      {salidas.map((salida, index) => {
        const esLarga = salida.descripcion.length > UMBRAL_EXPANDIR;
        const expandida = esLarga && (expandidas[index] ?? false);
        return (
          <div key={index} className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={salida.etiqueta}
                onChange={(e) => actualizar(index, { etiqueta: e.target.value })}
                placeholder="quiere_comprar"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(salidas.filter((_, i) => i !== index))}
                aria-label="Eliminar salida"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              value={salida.descripcion}
              onChange={(e) => actualizar(index, { descripcion: e.target.value })}
              placeholder="El cliente confirmó que quiere comprar el producto"
              className="h-8 text-xs"
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
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-200 ease-out',
                expandida ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden">
                <Textarea
                  value={salida.descripcion}
                  onChange={(e) => actualizar(index, { descripcion: e.target.value })}
                  rows={2}
                  className="text-xs"
                  aria-label="Descripción completa"
                />
              </div>
            </div>
            <DestinoSelect
              value={salida.nodoDestino}
              opcionesDestino={opcionesDestino}
              onValueChange={(v) => actualizar(index, { nodoDestino: v })}
              placeholder="Destino…"
              ariaLabel="Nodo destino"
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onChange([...salidas, { etiqueta: '', descripcion: '', nodoDestino: '' }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Agregar salida
      </Button>
    </div>
  );
}

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NODE_DESCRIPCION, NODE_VISUALS } from './nodeVisuals.js';
import { TIPOS_NODO, type TipoNodo } from '../types.js';

interface AddNodeMenuProps {
  onAdd: (tipo: TipoNodo) => void;
}

/** Menú para agregar un nodo nuevo al canvas. Cada opción trae su icono, igual que se ve luego en
 *  el nodo, y un tooltip que dice qué hace — así el menú enseña el vocabulario de tipos sin obligar
 *  a agregar un nodo para descubrirlo. */
export function AddNodeMenu({ onAdd }: AddNodeMenuProps): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="shadow-sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Agregar nodo
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {/* `skipDelayDuration`: con un tooltip ya abierto, el de la opción vecina aparece al
            instante (y sin animación, ver `instant-open`), así recorrer la lista se siente fluido
            sin perder el retardo inicial que evita abrirlos al pasar el mouse de largo. */}
        <TooltipProvider delayDuration={300} skipDelayDuration={400}>
          {TIPOS_NODO.map((tipo) => {
            const visual = NODE_VISUALS[tipo];
            const Icon = visual.icon;
            return (
              <Tooltip key={tipo}>
                <TooltipTrigger asChild>
                  <DropdownMenuItem onClick={() => onAdd(tipo)}>
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {visual.label}
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={10}
                  className="max-w-64 text-pretty leading-snug data-[state=instant-open]:animate-none"
                >
                  {NODE_DESCRIPCION[tipo]}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

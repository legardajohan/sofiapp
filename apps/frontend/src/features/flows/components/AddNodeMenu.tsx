import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NODE_VISUALS } from './nodeVisuals.js';
import { TIPOS_NODO, type TipoNodo } from '../types.js';

interface AddNodeMenuProps {
  onAdd: (tipo: TipoNodo) => void;
}

/** Menú para agregar un nodo nuevo al canvas. Cada opción trae su icono, igual que se ve luego en
 *  el nodo — así el menú también enseña el vocabulario de tipos. */
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
        {TIPOS_NODO.map((tipo) => {
          const visual = NODE_VISUALS[tipo];
          const Icon = visual.icon;
          return (
            <DropdownMenuItem key={tipo} onClick={() => onAdd(tipo)}>
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {visual.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

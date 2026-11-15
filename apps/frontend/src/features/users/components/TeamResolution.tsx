import { useEffect, useId, useState } from 'react';
import { UserRoundCog, UsersRound } from 'lucide-react';
import { RadioGroup } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MoverEquipo, UserDTO } from '../types.js';
import { OpcionCard } from './OpcionCard.js';

type Accion = MoverEquipo['accion'];

interface Props {
  /** Asesores a cargo del coordinador (activos o no). */
  asesores: number;
  /** Coordinadores activos que pueden recibir el equipo (ya excluye al afectado). */
  coordinadores: UserDTO[];
  /** `null` mientras la elección esté incompleta (reasignar sin destino). */
  onChange: (equipo: MoverEquipo | null) => void;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Qué pasa con los asesores de un coordinador que se desactiva o deja de serlo (AUTH-04). Ninguno
 * puede quedar colgando de alguien que ya no coordina: pasan a otro coordinador o quedan sin
 * coordinador, a cargo directo del Administrador.
 */
export function TeamResolution({ asesores, coordinadores, onChange }: Props): React.ReactElement {
  const id = useId();
  const [accion, setAccion] = useState<Accion>(coordinadores.length > 0 ? 'reasignar' : 'liberar');
  const [destinoId, setDestinoId] = useState('');

  useEffect(() => {
    if (accion === 'liberar') onChange({ accion: 'liberar' });
    else onChange(destinoId ? { accion: 'reasignar', coordinadorDestinoId: destinoId } : null);
  }, [accion, destinoId, onChange]);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-foreground">
        {plural(asesores, 'asesor a su cargo', 'asesores a su cargo')}
      </legend>
      <RadioGroup
        value={accion}
        onValueChange={(v) => setAccion(v as Accion)}
        aria-label="Qué hacer con su equipo"
        className="gap-2"
      >
        <OpcionCard
          id={`${id}-reasignar`}
          valor="reasignar"
          activa={accion === 'reasignar'}
          deshabilitada={coordinadores.length === 0}
          icono={<UserRoundCog className="h-4 w-4" />}
          titulo="Pasarlos a otro coordinador"
          detalle={
            coordinadores.length === 0
              ? 'No hay otro coordinador activo en la empresa.'
              : 'El nuevo coordinador los gestiona desde ese momento.'
          }
        >
          {accion === 'reasignar' && coordinadores.length > 0 && (
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger aria-label="Coordinador que recibe el equipo" className="mt-3 bg-background">
                <SelectValue placeholder="Elige un coordinador" />
              </SelectTrigger>
              <SelectContent>
                {coordinadores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </OpcionCard>

        <OpcionCard
          id={`${id}-liberar`}
          valor="liberar"
          activa={accion === 'liberar'}
          icono={<UsersRound className="h-4 w-4" />}
          titulo="Dejarlos sin coordinador"
          detalle="Siguen trabajando igual; solo un Administrador podrá gestionarlos."
        />
      </RadioGroup>
    </fieldset>
  );
}

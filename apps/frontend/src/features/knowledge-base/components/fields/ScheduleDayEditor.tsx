import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { KbScheduleDay } from '../../types/index.js';
import { RepeatableList } from './RepeatableList.js';

/** Intervalo por defecto de un día que se acaba de abrir: una jornada de oficina corriente. */
const INTERVALO_INICIAL = { desde: '08:00', hasta: '18:00' };
// Nota: su consumidor llega en HU-KB-10 («Horarios y ubicación»), no en HU-KB-09 como decía la
// numeración provisional de HU-KB-07.

const MAX_INTERVALOS = 4;

interface ScheduleDayEditorProps {
  dia: KbScheduleDay;
  onChange: (dia: KbScheduleDay) => void;
  /** Prefijo de los `id` de los controles; único por día dentro del formulario. */
  id: string;
}

/**
 * Un día de la semana con sus tramos de atención, o marcado como cerrado.
 *
 * Varios intervalos por día no es un lujo: el horario partido (mañana y tarde con almuerzo de por
 * medio) es lo normal en el comercio local, y aplanarlo a un solo rango haría que la IA dijera que
 * atienden a la hora en que están cerrados.
 *
 * «Cerrado» **es** información y se conserva al serializar; un día abierto pero sin tramos no dice
 * nada y se omite (ver `valorVacio` y `serializeEstructura`).
 */
export function ScheduleDayEditor({ dia, onChange, id }: ScheduleDayEditorProps): React.ReactElement {
  const idCerrado = `${id}-cerrado`;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium capitalize">{dia.dia}</span>
        <div className="flex items-center gap-2">
          <Label htmlFor={idCerrado} className="text-xs font-normal text-muted-foreground">
            Cerrado
          </Label>
          <Switch
            id={idCerrado}
            checked={dia.cerrado}
            onCheckedChange={(cerrado) =>
              // Al cerrar se conservan los tramos: reabrir el día no debería costar volver a escribirlos.
              onChange({ ...dia, cerrado })
            }
          />
        </div>
      </div>

      {!dia.cerrado && (
        <div className="mt-3">
          <RepeatableList
            items={dia.intervalos}
            onChange={(intervalos) => onChange({ ...dia, intervalos })}
            crearItem={() => ({ ...INTERVALO_INICIAL })}
            maxItems={MAX_INTERVALOS}
            etiquetaAgregar="Añadir horario"
            vacio={`Sin horario para ${dia.dia}. Añade uno o marca el día como cerrado.`}
            nombreItem="horario"
            renderItem={(intervalo, index, onItemChange) => (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={`Abre el ${dia.dia}, horario ${index + 1}`}
                  value={intervalo.desde}
                  onChange={(e) => onItemChange({ ...intervalo, desde: e.target.value })}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">
                  a
                </span>
                <Input
                  type="time"
                  aria-label={`Cierra el ${dia.dia}, horario ${index + 1}`}
                  value={intervalo.hasta}
                  onChange={(e) => onItemChange({ ...intervalo, hasta: e.target.value })}
                  className="w-32"
                />
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

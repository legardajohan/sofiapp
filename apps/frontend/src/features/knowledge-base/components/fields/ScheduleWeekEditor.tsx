import { copiarHorario } from '../../lib/kb-horario.js';
import type { KbScheduleDay } from '../../types/index.js';
import { ScheduleDayRow } from './ScheduleDayRow.js';

interface ScheduleWeekEditorProps {
  /** Los siete días, ya normalizados en orden canónico por quien llama. */
  dias: KbScheduleDay[];
  onChange: (dias: KbScheduleDay[]) => void;
}

/**
 * La semana completa de atención, en una sola pantalla (HU-KB-12).
 *
 * Sustituye a las siete tarjetas con borde de `ScheduleDayEditor`: filas alineadas dentro de un
 * único contenedor, para que el admin **compare los días** en vez de recorrerlos con scroll.
 *
 * Es dueño del array porque es el único que ve la semana entera, y copiar el horario de un día a
 * otros exige justamente eso — una fila sola no puede hacerlo.
 *
 * Varios intervalos por día no es un lujo: el horario partido (mañana y tarde con almuerzo de por
 * medio) es lo normal en el comercio local, y aplanarlo a un solo rango haría que la IA dijera que
 * atienden a la hora en que están cerrados.
 *
 * «Cerrado» **es** información y se conserva al serializar; un día abierto sin tramos útiles no dice
 * nada y se omite (ver `intervalosUtiles` y `serializeEstructura`).
 */
export function ScheduleWeekEditor({
  dias,
  onChange,
}: ScheduleWeekEditorProps): React.ReactElement {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {dias.map((dia, indice) => (
        <ScheduleDayRow
          key={dia.dia}
          dia={dia}
          onChange={(siguiente) => onChange(dias.map((d, n) => (n === indice ? siguiente : d)))}
          otrosDias={dias
            .filter((d) => d.dia !== dia.dia)
            .map((d) => ({ dia: d.dia, cerrado: d.cerrado }))}
          onCopiar={(destinos) => onChange(copiarHorario(dias, dia.dia, destinos))}
        />
      ))}
    </div>
  );
}

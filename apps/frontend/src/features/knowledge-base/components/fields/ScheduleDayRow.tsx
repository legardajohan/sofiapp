import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { KbScheduleDay, KbScheduleInterval } from '../../types/index.js';
import { CopiarHorarioMenu } from './CopiarHorarioMenu.js';
import { ScheduleIntervalRow } from './ScheduleIntervalRow.js';

/** Intervalo por defecto de un día que se acaba de abrir: una jornada de oficina corriente. */
const INTERVALO_INICIAL: KbScheduleInterval = { desde: '08:00', hasta: '18:00' };

/** Tope de tramos por día. El horario partido normal son dos; cuatro ya es holgado. */
export const MAX_INTERVALOS = 4;

interface ScheduleDayRowProps {
  dia: KbScheduleDay;
  onChange: (dia: KbScheduleDay) => void;
  /** Los otros seis días, para el menú de copiado. */
  otrosDias: ReadonlyArray<{ dia: string; cerrado: boolean }>;
  onCopiar: (destinos: readonly string[]) => void;
}

/**
 * Una fila de la semana: el día, su estado y sus tramos.
 *
 * La rejilla de dos columnas —una fija para el día, otra elástica para los tramos— es lo que
 * convierte siete bloques apilados en algo que se **compara de un vistazo**. Sin esa alineación
 * serían siete tarjetas más chatas, que es justo lo que había antes.
 */
export function ScheduleDayRow({
  dia,
  onChange,
  otrosDias,
  onCopiar,
}: ScheduleDayRowProps): React.ReactElement {
  const idCerrado = `kb-horario-${dia.dia}-cerrado`;
  const lleno = dia.intervalos.length >= MAX_INTERVALOS;

  function cambiarIntervalo(indice: number, siguiente: KbScheduleInterval): void {
    onChange({
      ...dia,
      intervalos: dia.intervalos.map((i, n) => (n === indice ? siguiente : i)),
    });
  }

  return (
    // Grupo rotulado con el día: los siete conviven en el mismo árbol y, sin esto, siete switches
    // llamados «Cerrado» son indistinguibles para quien navega con lector de pantalla.
    <div
      role="group"
      aria-label={dia.dia}
      className="grid gap-3 px-3 py-2.5 sm:grid-cols-[7.5rem_1fr]"
    >
      <div className="space-y-1.5">
        <span className="block text-sm font-medium capitalize">{dia.dia}</span>
        <div className="flex items-center gap-2">
          <Switch
            id={idCerrado}
            checked={dia.cerrado}
            // Al cerrar se conservan los tramos: reabrir el día no debería costar reescribirlos.
            onCheckedChange={(cerrado) => onChange({ ...dia, cerrado })}
          />
          <Label htmlFor={idCerrado} className="text-xs font-normal text-muted-foreground">
            Cerrado
          </Label>
        </div>
      </div>

      {dia.cerrado ? (
        // La fila cerrada queda por lo demás vacía, así que necesita decir algo: el badge es lo
        // único que la distingue de un día abierto al que aún no le pusieron horario.
        <div className="flex items-center">
          <Badge variant="secondary">Cerrado</Badge>
        </div>
      ) : (
        <div className="space-y-2">
          {dia.intervalos.map((intervalo, indice) => (
            <ScheduleIntervalRow
              // La posición ES la identidad del tramo, igual que en `RepeatableList`.
              key={indice}
              intervalo={intervalo}
              onChange={(siguiente) => cambiarIntervalo(indice, siguiente)}
              onQuitar={() =>
                onChange({ ...dia, intervalos: dia.intervalos.filter((_, n) => n !== indice) })
              }
              dia={dia.dia}
              indice={indice}
            />
          ))}

          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={lleno}
              onClick={() =>
                onChange({ ...dia, intervalos: [...dia.intervalos, { ...INTERVALO_INICIAL }] })
              }
              aria-label={`Añadir horario al ${dia.dia}`}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Añadir otro horario
            </Button>

            <CopiarHorarioMenu
              dia={dia.dia}
              otrosDias={otrosDias}
              onCopiar={onCopiar}
              disabled={dia.intervalos.length === 0}
            />

            {lleno && (
              <span className="text-xs text-muted-foreground">
                Llegaste al máximo de {MAX_INTERVALOS}.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

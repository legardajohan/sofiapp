import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProgramacionPendiente } from '@/features/contacts/components/ProgramacionPendiente';
import { etiquetaProgramacion } from '@/lib/agenda';
import { esYaGestionado, usePosponerPendiente } from '../hooks/useOrganizador.js';
import { instanteLocal, manana } from '../lib/organizador.js';
import { EtiquetasCliente } from './EtiquetasCliente.js';
import { ResumenPendiente } from './ResumenPendiente.js';
import type { PendienteGestionable } from '../types.js';

const MOTIVO_MIN = 3;
const MOTIVO_MAX = 500;

interface Props {
  pendiente: PendienteGestionable | null;
  onClose: () => void;
}

/** Qué falta para poder confirmar, en el orden en que se rellena el formulario. */
function validar(motivo: string, dia: string, hora: string | null, ahora: Date): string | null {
  if (motivo.trim().length < MOTIVO_MIN) return 'Escribe por qué lo pospones.';
  if (!hora) return 'Elige la nueva hora.';
  if (instanteLocal(dia, hora).getTime() <= ahora.getTime()) {
    return 'La nueva fecha y hora deben ser posteriores a la actual.';
  }
  return null;
}

function FormularioAplazamiento({
  pendiente,
  onClose,
}: {
  pendiente: PendienteGestionable;
  onClose: () => void;
}): React.ReactElement {
  const uid = useId();
  const posponer = usePosponerPendiente();
  const [motivo, setMotivo] = useState('');
  const [dia, setDia] = useState(manana);
  const [hora, setHora] = useState<string | null>(pendiente.programadoHora);
  const [tagIds, setTagIds] = useState<string[]>([]);

  const problema = validar(motivo, dia, hora, new Date());
  const ocupado = posponer.isPending;

  function confirmar(): void {
    if (problema || !hora) return;
    posponer.mutate(
      {
        id: pendiente.id,
        clienteId: pendiente.clienteId,
        input: { motivo: motivo.trim(), nuevoDia: dia, nuevaHora: hora, tagIds, version: pendiente.version },
      },
      { onSettled: (_d, error) => (!error || esYaGestionado(error) ? onClose() : undefined) },
    );
  }

  return (
    <>
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <ResumenPendiente pendiente={pendiente} />

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-motivo`} className="text-sm font-medium">
            ¿Por qué desea posponer este pendiente? <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={`${uid}-motivo`}
            value={motivo}
            maxLength={MOTIVO_MAX}
            rows={3}
            autoFocus
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. El cliente pidió que lo llamáramos el lunes"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-hora`} className="text-sm font-medium">
            Nueva fecha y hora <span className="text-destructive">*</span>
          </Label>
          <ProgramacionPendiente
            dia={dia}
            hora={hora}
            onDiaChange={setDia}
            onHoraChange={setHora}
            disabled={ocupado}
            horaObligatoria
            horaId={`${uid}-hora`}
          />
          {hora && !problema && (
            <p className="text-xs text-muted-foreground">
              Te avisaremos {etiquetaProgramacion(dia, hora).toLowerCase()}.
            </p>
          )}
        </div>

        <EtiquetasCliente value={tagIds} onChange={setTagIds} disabled={ocupado} />
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        {problema && (
          <p role="alert" className="mr-auto self-center text-xs text-muted-foreground">
            {problema}
          </p>
        )}
        <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={confirmar}
          disabled={problema !== null || ocupado}
          className="motion-safe:active:scale-[0.97]"
        >
          {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Confirmar aplazamiento
        </Button>
      </DialogFooter>
    </>
  );
}

/** POSPONER PENDIENTE (HU-PDF-02 §6): justificación, nueva fecha y hora futuras, etiquetas. */
export function PosponerPendienteDialog({ pendiente, onClose }: Props): React.ReactElement {
  return (
    <Dialog open={pendiente !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Posponer pendiente</DialogTitle>
          <DialogDescription>
            Volverá a avisarte en la nueva fecha. El cambio queda en el historial.
          </DialogDescription>
        </DialogHeader>
        {pendiente && (
          <FormularioAplazamiento key={pendiente.id} pendiente={pendiente} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

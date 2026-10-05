import { useEffect, useState } from 'react';
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
import { apiUrl } from '@/api/apiClient';
import { problemaConHora } from '../lib/programacion.js';
import { DateTimePicker } from './DateTimePicker.js';
import { ImageDropzone } from './ImageDropzone.js';
import type { CampaignDTO, RescheduleCampaignPayload } from '../types.js';

interface Props {
  campana: CampaignDTO;
  open: boolean;
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onSubmit: (payload: RescheduleCampaignPayload) => void;
}

/**
 * Cambiar la hora de una campaña que aún no ha salido, y de paso su imagen.
 *
 * Solo lo que tiene sentido tocar a última hora. Cambiar el segmento o la plantilla es otra
 * campaña: para eso se cancela esta y se programa de nuevo, que deja el historial legible.
 */
export function RescheduleDialog({
  campana,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: Props): React.ReactElement {
  const [fecha, setFecha] = useState<Date | null>(null);
  const [imagen, setImagen] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setFecha(campana.programadaPara ? new Date(campana.programadaPara) : null);
    setImagen(null);
  }, [open, campana.programadaPara]);

  const horaOriginal = campana.programadaPara ? new Date(campana.programadaPara).getTime() : null;
  const cambioHora = fecha !== null && fecha.getTime() !== horaOriginal;
  const hayCambios = cambioHora || imagen !== null;
  const horaValida = problemaConHora(fecha) === null;

  function guardar(): void {
    onSubmit({
      id: campana.id,
      ...(cambioHora && fecha ? { programadaPara: fecha.toISOString() } : {}),
      ...(imagen ? { imagen } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reprogramar «{campana.nombre}»</DialogTitle>
          <DialogDescription>
            Los contactos se cuentan a la hora nueva, con los mismos filtros.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <DateTimePicker valor={fecha} onChange={setFecha} />

          {campana.imagen ? (
            <div className="space-y-1.5">
              <Label>Imagen</Label>
              <ImageDropzone
                valor={imagen}
                onChange={setImagen}
                urlExistente={apiUrl(campana.imagen.url)}
                obligatoria
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Volver
          </Button>
          <Button
            type="button"
            onClick={guardar}
            disabled={pending || !hayCambios || !horaValida}
            className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

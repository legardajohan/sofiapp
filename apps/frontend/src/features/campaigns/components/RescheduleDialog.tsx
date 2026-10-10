import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWhatsAppTemplate } from '@/api/whatsapp-templates';
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
  // HT-WA-04: volver a la imagen por defecto de la plantilla (`quitarImagen` en el backend).
  const [restaurar, setRestaurar] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFecha(campana.programadaPara ? new Date(campana.programadaPara) : null);
    setImagen(null);
    setRestaurar(false);
  }, [open, campana.programadaPara]);

  // Solo hace falta la plantilla si la campaña lleva imagen propia: es lo que se puede restaurar.
  const { data: plantilla } = useQuery({
    queryKey: ['whatsapp-templates', 'detalle', campana.templateId],
    queryFn: () => getWhatsAppTemplate(campana.templateId),
    enabled: open && campana.imagen !== null,
  });
  const imagenDefectoUrl = plantilla?.imagen ? apiUrl(plantilla.imagen.url) : null;

  const horaOriginal = campana.programadaPara ? new Date(campana.programadaPara).getTime() : null;
  const cambioHora = fecha !== null && fecha.getTime() !== horaOriginal;
  const hayCambios = cambioHora || imagen !== null || restaurar;
  const horaValida = problemaConHora(fecha) === null;

  function guardar(): void {
    onSubmit({
      id: campana.id,
      ...(cambioHora && fecha ? { programadaPara: fecha.toISOString() } : {}),
      ...(imagen ? { imagen } : {}),
      ...(restaurar ? { quitarImagen: true } : {}),
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
              {restaurar && imagenDefectoUrl ? (
                <figure className="overflow-hidden rounded-lg border border-border bg-card">
                  <img
                    src={imagenDefectoUrl}
                    alt="Imagen por defecto de la plantilla"
                    className="aspect-[1.91/1] w-full bg-muted object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                  />
                  <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                      Se enviará la imagen por defecto de la plantilla.
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRestaurar(false)}>
                      Deshacer
                    </Button>
                  </figcaption>
                </figure>
              ) : (
                <>
                  <ImageDropzone
                    valor={imagen}
                    onChange={setImagen}
                    urlExistente={apiUrl(campana.imagen.url)}
                    obligatoria
                  />
                  {imagenDefectoUrl ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() => {
                        setImagen(null);
                        setRestaurar(true);
                      }}
                    >
                      Restaurar imagen por defecto
                    </Button>
                  ) : null}
                </>
              )}
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

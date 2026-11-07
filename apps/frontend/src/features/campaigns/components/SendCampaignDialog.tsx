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
import { aEtiquetaEnvio, type ValorEtiqueta } from '../lib/etiqueta.js';
import { sugerirNombreEtiqueta } from '../lib/rango.js';
import type { CampaignDTO, EtiquetaEnvio } from '../types.js';
import { TagField } from './TagField.js';

interface Props {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  campana: CampaignDTO;
  pending: boolean;
  onConfirm: (etiqueta: EtiquetaEnvio | undefined) => void;
}

/**
 * Enviar un borrador desde su detalle (HU-MARK-07). Antes de salir se ofrece la etiqueta —nueva o
 * una de las ya creadas—, igual que al lanzar desde el asistente: un borrador guardado no debe
 * perder esa opción por haberse enviado más tarde.
 */
export function SendCampaignDialog({
  open,
  onOpenChange,
  campana,
  pending,
  onConfirm,
}: Props): React.ReactElement {
  const sugerido = sugerirNombreEtiqueta(campana.nombre, new Date());
  const porMensajes = campana.audiencia?.tipo === 'mensajes_recientes';
  const [etiqueta, setEtiqueta] = useState<ValorEtiqueta>(null);

  // Cada apertura parte de cero. Por mensajes recientes la etiqueta viene encendida, como en el
  // asistente: es la forma de poder seguir después a quienes la recibieron.
  useEffect(() => {
    if (!open) return;
    setEtiqueta(
      porMensajes
        ? { modo: 'nueva', nombre: sugerirNombreEtiqueta(campana.nombre, new Date()) }
        : null,
    );
  }, [open, porMensajes, campana.nombre]);

  const envio = aEtiquetaEnvio(etiqueta);
  const listo = etiqueta === null || envio !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar «{campana.nombre}»</DialogTitle>
          <DialogDescription>
            Empieza a enviarse en cuanto confirmes, al ritmo que permite tu número.
          </DialogDescription>
        </DialogHeader>

        <TagField valor={etiqueta} onChange={setEtiqueta} sugerido={sugerido} />

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Volver
          </Button>
          <Button
            type="button"
            disabled={pending || !listo}
            onClick={() => onConfirm(envio)}
            className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
          >
            {pending ? 'Enviando…' : 'Enviar ahora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

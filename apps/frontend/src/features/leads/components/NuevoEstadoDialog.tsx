import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EstadoFormDialog } from '../../estados/components/EstadoFormDialog.js';
import { useCreateEstado } from '../../estados/hooks/useEstados.js';

/**
 * Alta rápida de una etapa desde la barra de filtros del listado (HU-CRM-03).
 *
 * El formulario es **el mismo** que el de la pantalla de gestión (`EstadoFormDialog`): dos altas de
 * lo mismo con campos distintos —una con vista previa del color y otra sin ella— darían dos
 * resultados distintos según por dónde entró el administrador. Aquí solo cambia el disparador, que
 * vive donde se está filtrando.
 */
export function NuevoEstadoDialog(): React.ReactElement {
  const [abierto, setAbierto] = useState(false);
  const crear = useCreateEstado();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]"
        onClick={() => setAbierto(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Nueva etapa
      </Button>

      <EstadoFormDialog
        estado={null}
        open={abierto}
        pending={crear.isPending}
        onOpenChange={setAbierto}
        onSubmit={({ label, color }) =>
          crear.mutate({ label, color }, { onSuccess: () => setAbierto(false) })
        }
      />
    </>
  );
}

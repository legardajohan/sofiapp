import { useGestionPendienteStore } from '../useGestionPendienteStore.js';
import { CerrarPendienteDialog } from './CerrarPendienteDialog.js';
import { PosponerPendienteDialog } from './PosponerPendienteDialog.js';

/** Los dos modales de gestión, montados una sola vez en `AppLayout`. */
export function GestionPendienteDialogs(): React.ReactElement {
  const objetivo = useGestionPendienteStore((s) => s.objetivo);
  const accion = useGestionPendienteStore((s) => s.accion);
  const cerrarDialogo = useGestionPendienteStore((s) => s.cerrarDialogo);

  return (
    <>
      <CerrarPendienteDialog pendiente={accion === 'cerrar' ? objetivo : null} onClose={cerrarDialogo} />
      <PosponerPendienteDialog
        pendiente={accion === 'posponer' ? objetivo : null}
        onClose={cerrarDialogo}
      />
    </>
  );
}
